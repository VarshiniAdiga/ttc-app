import { createAuth } from "@ttc/auth";
import { createDb } from "@ttc/db";
import { env } from "@ttc/env/server";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import coaching from "./routes/coaching";
import consent from "./routes/consent";
import dashboard from "./routes/dashboard";
import invite from "./routes/invite";
import logs from "./routes/logs";
import todos from "./routes/todos";

type Vars = { userId: string | null };

const app = new Hono<{ Variables: Vars }>();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-dev-user-id"],
    credentials: true,
  }),
);

// Dev login shim: outside production, trust the x-dev-user-id header as the current user.
// Phase 10 replaces this with the verified Better Auth session; nothing else changes.
app.use("/*", async (c, next) => {
  const devUser = env.APP_ENV !== "production" ? c.req.header("x-dev-user-id") : undefined;
  c.set("userId", devUser ?? null);
  await next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => createAuth().handler(c.req.raw));

app.get("/", (c) => c.text("OK"));

app.get("/health", (c) =>
  c.json({ ok: true, appEnv: env.APP_ENV, user: c.get("userId") }),
);

// Best-effort DB connectivity check. Green once DATABASE_URL points at a real DB.
app.get("/health/db", async (c) => {
  try {
    const db = createDb();
    await db.execute(sql`select 1`);
    return c.json({ db: "connected" });
  } catch (e) {
    return c.json({ db: "error", message: (e as Error).message }, 503);
  }
});

// Echoes the current user so the app's dev switcher is verifiable end to end.
app.get("/api/me", (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "no user" }, 401);
  return c.json({ userId });
});

// Phase 2 — her core tracker (period, BBT, OPK, mucus, symptoms), RLS-scoped.
// Phase 4 added `habit` (his log) to the same generic route.
app.route("/api/logs", logs);

// Phase 5 — consent switches + the server-decided shared dashboard.
app.route("/api/consent", consent);
app.route("/api/dashboard", dashboard);

// Phase 6 — shared to-dos + partner-invite flow.
app.route("/api/todos", todos);
app.route("/api/invite", invite);

// Phase 7 — coaching rules engine (paid, gated behind a fake pro flag for now).
app.route("/api/coaching", coaching);

export default app;
