import { acceptInvite, createDb, createInvite, InviteError } from "@ttc/db";
import { env } from "@ttc/env/server";
import { Hono } from "hono";
import { z } from "zod";

// Phase 6 — partner invite. The core (couple + consent creation, expiry,
// single-use) lives in @ttc/db so it's unit-tested; this route just enforces who
// is calling and shapes the link. Both handlers use the superuser connection
// because accept crosses two users. Email delivery (Resend) is Phase 9 plumbing;
// for now the app shares the link natively.

type Vars = { userId: string | null };

const CATEGORIES = ["cycle", "bbt", "opk", "mucus", "symptom", "habit", "fertile_window"] as const;

const app = new Hono<{ Variables: Vars }>();

app.use("/*", async (c, next) => {
  if (!c.get("userId")) return c.json({ error: "no user" }, 401);
  await next();
});

app.post("/", async (c) => {
  const body = z
    .object({ categories: z.array(z.enum(CATEGORIES)).default([]) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const { token, expiresAt } = await createInvite(createDb(), c.get("userId")!, body.data.categories);
  // A shareable deep link; the marketing site (Phase 12) will resolve it to the
  // right store / app. For dev, the token is what the accept call needs.
  const url = `${env.CORS_ORIGIN}/invite/${token}`;
  return c.json({ token, url, expiresAt });
});

app.post("/:token/accept", async (c) => {
  try {
    const result = await acceptInvite(createDb(), c.req.param("token"), c.get("userId")!);
    return c.json(result);
  } catch (e) {
    if (e instanceof InviteError) return c.json({ error: e.message }, e.status);
    throw e;
  }
});

export default app;
