import { createDb, entitlement } from "@ttc/db";
import { env } from "@ttc/env/server";
import { Hono } from "hono";

// Phase 8 — RevenueCat webhook: the REAL source of the `pro` entitlement.
// RevenueCat calls this on every subscription lifecycle event; we translate the
// event into the `entitlement` row the coaching gate already reads (Phase 7).
// The client never writes entitlements — the server does, from a signed webhook —
// so a modified app cannot grant itself Pro.

// Event types that mean "the subscription is active" vs "no longer active".
// https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
const ACTIVE = new Set(["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION", "NON_RENEWING_PURCHASE"]);
const INACTIVE = new Set(["EXPIRATION", "CANCELLATION", "SUBSCRIPTION_PAUSED", "BILLING_ISSUE"]);

type RcEvent = {
  event?: {
    type?: string;
    app_user_id?: string;
    expiration_at_ms?: number | null;
  };
};

const app = new Hono();

app.post("/webhook", async (c) => {
  // RevenueCat sends the value you configure as the webhook Authorization header.
  const secret = env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: "webhook not configured" }, 501);
  if (c.req.header("Authorization") !== secret) return c.json({ error: "unauthorized" }, 401);

  const { event } = (await c.req.json().catch(() => ({}))) as RcEvent;
  const userId = event?.app_user_id;
  const type = event?.type;
  if (!userId || !type) return c.json({ error: "bad event" }, 400);

  // CANCELLATION means "won't renew" but access lasts until expiry — ignore it
  // for gating; EXPIRATION is what actually cuts access.
  if (type === "CANCELLATION") return c.json({ ok: true, ignored: type });

  const isPro = ACTIVE.has(type) ? true : INACTIVE.has(type) ? false : undefined;
  if (isPro === undefined) return c.json({ ok: true, ignored: type });

  await createDb()
    .insert(entitlement)
    .values({
      userId,
      product: "pro",
      isPro,
      status: type,
      expiresAt: event?.expiration_at_ms ? new Date(event.expiration_at_ms) : null,
    })
    .onConflictDoUpdate({
      target: [entitlement.userId, entitlement.product],
      set: {
        isPro,
        status: type,
        expiresAt: event?.expiration_at_ms ? new Date(event.expiration_at_ms) : null,
        updatedAt: new Date(),
      },
    });

  return c.json({ ok: true, userId, isPro });
});

export default app;
