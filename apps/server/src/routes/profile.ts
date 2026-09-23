import { createAppDb, profile, withUser } from "@ttc/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

// Phase 10 — the user's own profile: role (her/him, chosen in onboarding),
// display name, and (Phase 9) their Expo push token. RLS profile_owner scopes
// every query here to the current user, so this is just read/write shape.

type Vars = { userId: string | null };

const app = new Hono<{ Variables: Vars }>();

app.use("/*", async (c, next) => {
  if (!c.get("userId")) return c.json({ error: "no user" }, 401);
  await next();
});

app.get("/", async (c) => {
  const userId = c.get("userId")!;
  const db = createAppDb();
  const [row] = await withUser(db, userId, (tx) =>
    tx
      .select({ role: profile.role, displayName: profile.displayName, pushToken: profile.pushToken })
      .from(profile)
      .where(eq(profile.userId, userId))
      .limit(1),
  );
  return c.json({ profile: row ?? null });
});

// Partial upsert. Onboarding sends { role, displayName }; the notification toggle
// sends { pushToken } (or null to turn discreet notifications off).
const patch = z
  .object({
    role: z.enum(["her", "him"]).optional(),
    displayName: z.string().min(1).max(80).optional(),
    pushToken: z.string().max(500).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, "nothing to update");

app.post("/", async (c) => {
  const body = patch.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const userId = c.get("userId")!;
  const db = createAppDb();
  const [row] = await withUser(db, userId, (tx) =>
    tx
      .insert(profile)
      .values({ userId, ...body.data })
      .onConflictDoUpdate({ target: profile.userId, set: { ...body.data, updatedAt: new Date() } })
      .returning({ role: profile.role, displayName: profile.displayName, pushToken: profile.pushToken }),
  );
  return c.json({ profile: row });
});

export default app;
