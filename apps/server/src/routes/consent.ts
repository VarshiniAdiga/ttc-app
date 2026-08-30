import { couple, createAppDb, sharingConsent, withUser } from "@ttc/db";
import { eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

// Phase 5 — the owner's consent switches. Default-OFF: a category is shared only
// when a granted row exists. RLS (sharing_consent_owner) already scopes every
// query here to the current user as owner; this route just reads/writes shape.

type Vars = { userId: string | null };

const CATEGORIES = [
  "cycle",
  "bbt",
  "opk",
  "mucus",
  "symptom",
  "habit",
  "fertile_window",
] as const;

const app = new Hono<{ Variables: Vars }>();

app.use("/*", async (c, next) => {
  if (!c.get("userId")) return c.json({ error: "no user" }, 401);
  await next();
});

// The current user's own switches (only granted-or-not for their categories).
app.get("/", async (c) => {
  const db = createAppDb();
  const rows = await withUser(db, c.get("userId")!, (tx) =>
    tx
      .select({ category: sharingConsent.category, granted: sharingConsent.granted })
      .from(sharingConsent)
      .where(eq(sharingConsent.ownerId, c.get("userId")!)),
  );
  return c.json({ consent: rows });
});

// Flip one switch. Needs the couple id (each consent row is scoped to a couple).
app.post("/", async (c) => {
  const body = z
    .object({ category: z.enum(CATEGORIES), granted: z.boolean() })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const userId = c.get("userId")!;
  const db = createAppDb();
  const [row] = await withUser(db, userId, async (tx) => {
    const [cpl] = await tx
      .select({ id: couple.id })
      .from(couple)
      .where(or(eq(couple.memberA, userId), eq(couple.memberB, userId)))
      .limit(1);
    if (!cpl) return [undefined];
    return tx
      .insert(sharingConsent)
      .values({ coupleId: cpl.id, ownerId: userId, category: body.data.category, granted: body.data.granted })
      .onConflictDoUpdate({
        target: [sharingConsent.coupleId, sharingConsent.ownerId, sharingConsent.category],
        set: { granted: body.data.granted, updatedAt: new Date() },
      })
      .returning({ category: sharingConsent.category, granted: sharingConsent.granted });
  });
  if (!row) return c.json({ error: "not linked to a partner yet" }, 409);
  return c.json({ consent: row });
});

export default app;
