import {
  bbtLog,
  coaching,
  couple,
  createAppDb,
  createDb,
  cycleLog,
  entitlement,
  habitLog,
  opkLog,
  profile,
  withUser,
} from "@ttc/db";
import { buildHerContext, buildHimContext, evaluate, type CoachingAction } from "@ttc/domain";
import { env } from "@ttc/env/server";
import { and, desc, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

// Phase 7 — coaching. The weekly job (POST /generate) reads both partners' logs,
// runs the data-driven rules engine, and stores ONE action per partner stamped
// with the rule id/version. Reading coaching (GET /) is gated behind a "pro"
// flag; for now `POST /dev-pro` fakes the flag. Phase 8 swaps the flag's source
// for RevenueCat but keeps this same gate.

type Vars = { userId: string | null };

// Monday (UTC) of the week containing `d`, as YYYY-MM-DD.
function weekOf(d = new Date()): string {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const offset = (dt.getUTCDay() + 6) % 7; // 0 = Monday
  dt.setUTCDate(dt.getUTCDate() - offset);
  return dt.toISOString().slice(0, 10);
}

async function isPro(userId: string): Promise<boolean> {
  const db = createAppDb();
  const rows = await withUser(db, userId, (tx) =>
    tx
      .select({ isPro: entitlement.isPro })
      .from(entitlement)
      .where(and(eq(entitlement.userId, userId), eq(entitlement.isPro, true)))
      .limit(1),
  );
  return rows.length > 0;
}

const app = new Hono<{ Variables: Vars }>();

app.use("/*", async (c, next) => {
  if (!c.get("userId")) return c.json({ error: "no user" }, 401);
  await next();
});

// Dev-only fake pro flag (Phase 8 replaces the writer with the RevenueCat webhook).
app.post("/dev-pro", async (c) => {
  if (env.APP_ENV === "production") return c.json({ error: "not available" }, 404);
  const body = z.object({ isPro: z.boolean() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const userId = c.get("userId")!;
  // Superuser write: entitlements are written by the server, never the user (RLS
  // gives the user read-only access).
  await createDb()
    .insert(entitlement)
    .values({ userId, product: "pro", isPro: body.data.isPro })
    .onConflictDoUpdate({
      target: [entitlement.userId, entitlement.product],
      set: { isPro: body.data.isPro, updatedAt: new Date() },
    });
  return c.json({ isPro: body.data.isPro });
});

app.get("/pro-status", async (c) => c.json({ isPro: await isPro(c.get("userId")!) }));

// The weekly job. In dev it's triggered on demand; in prod a cron runs it.
app.post("/generate", async (c) => {
  const userId = c.get("userId")!;
  const db = createDb(); // crosses both users -> superuser

  const [cpl] = await db
    .select()
    .from(couple)
    .where(or(eq(couple.memberA, userId), eq(couple.memberB, userId)))
    .limit(1);
  if (!cpl) return c.json({ error: "not linked to a partner yet" }, 409);

  const profiles = await db
    .select({ userId: profile.userId, role: profile.role })
    .from(profile)
    .where(or(eq(profile.userId, cpl.memberA), eq(profile.userId, cpl.memberB)));
  const herId = profiles.find((p) => p.role === "her")?.userId;
  const himId = profiles.find((p) => p.role === "him")?.userId;

  const today = new Date().toISOString().slice(0, 10);
  const week = weekOf(); // the label the coaching row is stored under
  const actions: (CoachingAction & { userId: string })[] = [];

  if (herId) {
    const [cycles, bbt, opk] = await Promise.all([
      db.select({ date: cycleLog.date, flow: cycleLog.flow }).from(cycleLog).where(eq(cycleLog.userId, herId)),
      db.select({ date: bbtLog.date }).from(bbtLog).where(eq(bbtLog.userId, herId)),
      db.select({ date: opkLog.date, result: opkLog.result }).from(opkLog).where(eq(opkLog.userId, herId)),
    ]);
    const action = evaluate(buildHerContext({ cycles, bbt, opk }, today));
    if (action) actions.push({ userId: herId, ...action });
  }
  if (himId) {
    const habits = await db
      .select({
        date: habitLog.date,
        alcoholUnits: habitLog.alcoholUnits,
        cigarettes: habitLog.cigarettes,
        heatExposure: habitLog.heatExposure,
      })
      .from(habitLog)
      .where(eq(habitLog.userId, himId));
    const action = evaluate(buildHimContext(habits, today));
    if (action) actions.push({ userId: himId, ...action });
  }

  // Idempotent for the week: clear then re-insert so re-running doesn't duplicate.
  await db.delete(coaching).where(and(eq(coaching.coupleId, cpl.id), eq(coaching.weekOf, week)));
  if (actions.length) {
    await db.insert(coaching).values(
      actions.map((a) => ({
        coupleId: cpl.id,
        userId: a.userId,
        ruleId: a.ruleId,
        ruleVersion: a.ruleVersion,
        priority: a.priority,
        body: a.body,
        weekOf: week,
      })),
    );
  }
  return c.json({ weekOf: week, generated: actions.length });
});

// Read this user's coaching — the paid feature, gated on the pro flag.
app.get("/", async (c) => {
  const userId = c.get("userId")!;
  if (!(await isPro(userId))) return c.json({ error: "pro required" }, 402);
  const db = createAppDb();
  const rows = await withUser(db, userId, (tx) =>
    tx
      .select()
      .from(coaching)
      .where(eq(coaching.userId, userId))
      .orderBy(desc(coaching.weekOf), desc(coaching.createdAt)),
  );
  return c.json({ coaching: rows });
});

export default app;
