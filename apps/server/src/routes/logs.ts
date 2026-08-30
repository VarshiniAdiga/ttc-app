import {
  bbtLog,
  createAppDb,
  cycleLog,
  habitLog,
  mucusLog,
  opkLog,
  symptomLog,
  withUser,
} from "@ttc/db";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { signedOpkUrl, storageEnabled, uploadOpkPhoto } from "../storage";

type Vars = { userId: string | null };

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

// Each of her tracker categories: its table + the Zod schema for the editable
// fields. Authorization is NOT here — row-level security scopes every query to
// the current user; these schemas only validate shape.
const LOGS = {
  cycle: {
    table: cycleLog,
    fields: z.object({
      flow: z.enum(["spotting", "light", "medium", "heavy"]).nullish(),
      notes: z.string().max(1000).nullish(),
    }),
  },
  bbt: {
    table: bbtLog,
    // numeric column round-trips as string in drizzle; store the temp as text.
    fields: z.object({
      tempC: z.number().min(34).max(42).transform((n) => n.toFixed(2)),
    }),
  },
  opk: {
    table: opkLog,
    fields: z.object({
      result: z.enum(["low", "high", "peak", "positive", "negative"]).nullish(),
    }),
  },
  mucus: {
    table: mucusLog,
    fields: z.object({
      type: z.enum(["dry", "sticky", "creamy", "watery", "eggwhite"]).nullish(),
    }),
  },
  symptom: {
    table: symptomLog,
    fields: z.object({
      symptoms: z.array(z.string()).default([]),
      notes: z.string().max(1000).nullish(),
    }),
  },
  // Phase 4 — his daily habit log. Same upsert-by-day CRUD; RLS keeps it private
  // to him unless he grants the `habit` consent category.
  habit: {
    table: habitLog,
    fields: z.object({
      alcoholUnits: z.number().int().min(0).max(50).nullish(),
      cigarettes: z.number().int().min(0).max(100).nullish(),
      exerciseMinutes: z.number().int().min(0).max(1440).nullish(),
      // numeric column round-trips as string in drizzle.
      sleepHours: z.number().min(0).max(24).transform((n) => n.toFixed(1)).nullish(),
      heatExposure: z.boolean().nullish(),
      stressLevel: z.number().int().min(1).max(5).nullish(),
      notes: z.string().max(1000).nullish(),
    }),
  },
} as const;

type LogType = keyof typeof LOGS;
const isLogType = (t: string): t is LogType => t in LOGS;

const app = new Hono<{ Variables: Vars }>();

// Every route here needs a current user (dev shim now, real session in Phase 10).
app.use("/*", async (c, next) => {
  if (!c.get("userId")) return c.json({ error: "no user" }, 401);
  await next();
});

// --- OPK photo (private storage) — registered before the generic routes -----

app.post("/opk/:date/photo", async (c) => {
  if (!storageEnabled()) return c.json({ error: "photo storage not configured" }, 501);
  const parsed = dateStr.safeParse(c.req.param("date"));
  if (!parsed.success) return c.json({ error: "bad date" }, 400);
  const date = parsed.data;
  const body = z
    .object({ base64: z.string().min(1), contentType: z.string().default("image/jpeg") })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const bytes = Uint8Array.from(atob(body.data.base64), (ch) => ch.charCodeAt(0));
  const userId = c.get("userId")!;
  const path = await uploadOpkPhoto(userId, date, bytes, body.data.contentType);

  const db = createAppDb();
  await withUser(db, userId, (tx) =>
    tx
      .insert(opkLog)
      .values({ userId, date, photoPath: path })
      .onConflictDoUpdate({
        target: [opkLog.userId, opkLog.date],
        set: { photoPath: path, updatedAt: new Date() },
      }),
  );
  return c.json({ path });
});

app.get("/opk/:date/photo-url", async (c) => {
  if (!storageEnabled()) return c.json({ error: "photo storage not configured" }, 501);
  const parsed = dateStr.safeParse(c.req.param("date"));
  if (!parsed.success) return c.json({ error: "bad date" }, 400);

  const db = createAppDb();
  const [row] = await withUser(db, c.get("userId")!, (tx) =>
    tx
      .select({ photoPath: opkLog.photoPath })
      .from(opkLog)
      .where(eq(opkLog.date, parsed.data))
      .limit(1),
  );
  if (!row?.photoPath) return c.json({ error: "no photo" }, 404);
  return c.json({ url: await signedOpkUrl(row.photoPath) });
});

// --- generic per-category CRUD ---------------------------------------------

// List the current user's entries for a category, newest day first.
app.get("/:type", async (c) => {
  const type = c.req.param("type");
  if (!isLogType(type)) return c.json({ error: "unknown log type" }, 404);
  const table = LOGS[type].table;
  const db = createAppDb();
  const entries = await withUser(db, c.get("userId")!, (tx) =>
    tx.select().from(table).orderBy(desc(table.date)),
  );
  return c.json({ entries });
});

// Create or edit the entry for one day (one entry per day, enforced by a unique
// index). Upsert keeps the API single-call: same route creates and edits.
app.post("/:type", async (c) => {
  const type = c.req.param("type");
  if (!isLogType(type)) return c.json({ error: "unknown log type" }, 404);
  const { table, fields } = LOGS[type] as { table: typeof cycleLog; fields: z.ZodTypeAny };

  const body = z
    .object({ date: dateStr })
    .and(fields)
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const { date, ...values } = body.data as { date: string } & Record<string, unknown>;
  const userId = c.get("userId")!;
  const db = createAppDb();
  const [entry] = await withUser(db, userId, (tx) =>
    tx
      .insert(table)
      .values({ userId, date, ...values })
      .onConflictDoUpdate({
        target: [table.userId, table.date],
        set: { ...values, updatedAt: new Date() },
      })
      .returning(),
  );
  return c.json({ entry });
});

// Delete one day's entry. RLS already limits this to the caller's own rows.
app.delete("/:type/:date", async (c) => {
  const type = c.req.param("type");
  if (!isLogType(type)) return c.json({ error: "unknown log type" }, 404);
  const parsed = dateStr.safeParse(c.req.param("date"));
  if (!parsed.success) return c.json({ error: "bad date" }, 400);
  const table = LOGS[type].table;
  const db = createAppDb();
  const deleted = await withUser(db, c.get("userId")!, (tx) =>
    tx.delete(table).where(eq(table.date, parsed.data)).returning({ id: table.id }),
  );
  return c.json({ deleted: deleted.length });
});

export default app;
