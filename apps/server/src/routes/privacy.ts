import {
  bbtLog,
  coaching,
  couple,
  createDb,
  cycleLog,
  entitlement,
  habitLog,
  mucusLog,
  opkLog,
  profile,
  sharingConsent,
  symptomLog,
  todo,
  user,
} from "@ttc/db";
import { eq, or } from "drizzle-orm";
import { Hono } from "hono";

import { deleteUserPhotos } from "../storage";

// Phase 9 — privacy controls the app is selling on. Both use the superuser
// connection: export must gather everything the user owns; delete is a real hard
// delete that must reach rows RLS would otherwise hide.

type Vars = { userId: string | null };

const app = new Hono<{ Variables: Vars }>();

app.use("/*", async (c, next) => {
  if (!c.get("userId")) return c.json({ error: "no user" }, 401);
  await next();
});

// GET /export — everything this user owns, as one JSON document they can save.
app.get("/export", async (c) => {
  const userId = c.get("userId")!;
  const db = createDb();
  const [me, cycles, bbt, opk, mucus, symptom, habits, consents, ents, coach, couples] = await Promise.all([
    db.select().from(profile).where(eq(profile.userId, userId)),
    db.select().from(cycleLog).where(eq(cycleLog.userId, userId)),
    db.select().from(bbtLog).where(eq(bbtLog.userId, userId)),
    db.select().from(opkLog).where(eq(opkLog.userId, userId)),
    db.select().from(mucusLog).where(eq(mucusLog.userId, userId)),
    db.select().from(symptomLog).where(eq(symptomLog.userId, userId)),
    db.select().from(habitLog).where(eq(habitLog.userId, userId)),
    db.select().from(sharingConsent).where(eq(sharingConsent.ownerId, userId)),
    db.select().from(entitlement).where(eq(entitlement.userId, userId)),
    db.select().from(coaching).where(eq(coaching.userId, userId)),
    db.select().from(couple).where(or(eq(couple.memberA, userId), eq(couple.memberB, userId))),
  ]);

  // Shared to-dos, scoped to the user's couple.
  const coupleId = couples[0]?.id;
  const todos = coupleId ? await db.select().from(todo).where(eq(todo.coupleId, coupleId)) : [];

  return c.json({
    exportedAt: new Date().toISOString(),
    userId,
    profile: me[0] ?? null,
    couples,
    logs: { cycle: cycles, bbt, opk, mucus, symptom, habit: habits },
    sharingConsent: consents,
    todos,
    coaching: coach,
    entitlement: ents,
  });
});

// DELETE /all — one-tap erase. Deleting the user row cascades to EVERY table
// that references it (profile, all logs, couple → consent/todo/coaching, invites,
// entitlement, and Better Auth sessions/accounts). Photos live outside Postgres,
// so delete them first.
app.delete("/all", async (c) => {
  const userId = c.get("userId")!;
  const photos = await deleteUserPhotos(userId);
  const deleted = await createDb().delete(user).where(eq(user.id, userId)).returning({ id: user.id });
  return c.json({ ok: true, deletedUser: deleted.length, deletedPhotos: photos });
});

export default app;
