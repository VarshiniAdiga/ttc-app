import {
  couple,
  createAppDb,
  createDb,
  cycleLog,
  habitLog,
  profile,
  sharingConsent,
  withUser,
} from "@ttc/db";
import { predictFromCycleLogs } from "@ttc/domain";
import { and, desc, eq, or } from "drizzle-orm";
import { Hono } from "hono";

// Phase 5 — the shared dashboard. The SERVER decides what's visible, not the app.
//
// Two kinds of sharing meet here:
//  - his habit status: read as the viewer, so RLS returns the partner's rows only
//    when he granted `habit`. If not granted, the query simply returns nothing.
//  - her fertile window: DERIVED from cycle data, so it can't ride on cycle RLS.
//    We check the explicit `fertile_window` consent, and only then read her cycle
//    logs (superuser) to compute the window — returning the estimate, never the
//    raw cycle rows.

type Vars = { userId: string | null };

const app = new Hono<{ Variables: Vars }>();

app.use("/*", async (c, next) => {
  if (!c.get("userId")) return c.json({ error: "no user" }, 401);
  await next();
});

app.get("/", async (c) => {
  const viewerId = c.get("userId")!;
  const db = createAppDb();

  const ctx = await withUser(db, viewerId, async (tx) => {
    const [cpl] = await tx
      .select()
      .from(couple)
      .where(or(eq(couple.memberA, viewerId), eq(couple.memberB, viewerId)))
      .limit(1);
    if (!cpl) return null;
    const partnerId = cpl.memberA === viewerId ? cpl.memberB : cpl.memberA;

    const [partner] = await tx
      .select({ userId: profile.userId, displayName: profile.displayName, role: profile.role })
      .from(profile)
      .where(eq(profile.userId, partnerId))
      .limit(1);

    // RLS gates this: rows come back only if the partner granted `habit`.
    const [habit] = await tx
      .select()
      .from(habitLog)
      .where(eq(habitLog.userId, partnerId))
      .orderBy(desc(habitLog.date))
      .limit(1);

    // Explicit derived-data consent check (partner_read lets us see this row).
    const fw = await tx
      .select({ granted: sharingConsent.granted })
      .from(sharingConsent)
      .where(
        and(
          eq(sharingConsent.ownerId, partnerId),
          eq(sharingConsent.category, "fertile_window"),
          eq(sharingConsent.granted, true),
        ),
      )
      .limit(1);

    return { partnerId, partner: partner ?? null, habit: habit ?? null, fertileGranted: fw.length > 0 };
  });

  if (!ctx) return c.json({ partner: null, habit: null, fertileWindow: null });

  let fertileWindow: ReturnType<typeof predictFromCycleLogs> | null = null;
  if (ctx.fertileGranted) {
    // Superuser read, gated above by consent; we return only the derived estimate.
    const sdb = createDb();
    const cycles = await sdb
      .select({ date: cycleLog.date, flow: cycleLog.flow })
      .from(cycleLog)
      .where(eq(cycleLog.userId, ctx.partnerId))
      .orderBy(desc(cycleLog.date));
    fertileWindow = predictFromCycleLogs(cycles);
  }

  return c.json({
    partner: ctx.partner,
    habit: ctx.habit, // null when he hasn't shared his habit log
    fertileWindow, // null when she hasn't shared her fertile window
  });
});

export default app;
