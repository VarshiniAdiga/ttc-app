import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { AppDb } from "./app-db";
import { couple, invite, sharingConsent } from "./schema";

// Phase 6 partner-invite core, kept out of the Worker route so it's testable in
// the db package's vitest harness. These run on the SUPERUSER connection: accept
// crosses two users (creates a couple, writes the inviter's consent rows), which
// no single RLS role can do. The route enforces "who is calling".

export class InviteError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 410,
  ) {
    super(message);
  }
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// A couple row is order-normalized (member_a < member_b) so the unique index
// treats (a,b) and (b,a) as the same pair — no duplicate couples.
const ordered = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

export async function createInvite(
  db: AppDb,
  inviterId: string,
  categories: string[],
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomUUID();
  const expiresAt = new Date(now.getTime() + TTL_MS);
  await db.insert(invite).values({ token, inviterId, categories, expiresAt });
  return { token, expiresAt };
}

export async function acceptInvite(
  db: AppDb,
  token: string,
  userId: string,
  now: Date = new Date(),
): Promise<{ coupleId: string }> {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invite).where(eq(invite.token, token)).limit(1);
    if (!inv) throw new InviteError("invite not found", 404);
    if (inv.acceptedAt) throw new InviteError("invite already used", 409);
    if (inv.expiresAt.getTime() < now.getTime()) throw new InviteError("invite expired", 410);
    if (inv.inviterId === userId) throw new InviteError("cannot accept your own invite", 400);

    const [a, b] = ordered(inv.inviterId, userId);
    await tx
      .insert(couple)
      .values({ memberA: a, memberB: b })
      .onConflictDoNothing({ target: [couple.memberA, couple.memberB] });
    const [c] = await tx
      .select({ id: couple.id })
      .from(couple)
      .where(and(eq(couple.memberA, a), eq(couple.memberB, b)))
      .limit(1);
    const coupleId = c!.id;

    // Write the inviter's chosen consent rows, granted-ON (default-OFF rows can
    // still be added later via the consent screen). Idempotent on re-link.
    for (const category of inv.categories) {
      await tx
        .insert(sharingConsent)
        .values({ coupleId, ownerId: inv.inviterId, category: category as never, granted: true })
        .onConflictDoUpdate({
          target: [sharingConsent.coupleId, sharingConsent.ownerId, sharingConsent.category],
          set: { granted: true, updatedAt: now },
        });
    }

    await tx
      .update(invite)
      .set({ acceptedBy: userId, acceptedAt: now })
      .where(eq(invite.id, inv.id));
    return { coupleId };
  });
}
