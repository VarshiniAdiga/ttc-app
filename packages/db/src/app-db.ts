import { env } from "@ttc/env/server";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

// Connects as the non-superuser `ttc_app` role so row-level security actually
// binds (the superuser client in `createDb()` bypasses RLS by design, and is
// only for auth/migrations). Every user-facing data route goes through here.
export function createAppDb() {
  const client = postgres(env.APP_DATABASE_URL || "", { max: 1 });
  return drizzle({ client, schema });
}

export type AppDb = ReturnType<typeof createAppDb>;

// Run `fn` inside a transaction with `app.user_id` bound, so RLS scopes every
// query in it to `userId`. Same trick as `runAsUser` in rls.ts, but for drizzle.
export function withUser<T>(
  db: AppDb,
  userId: string,
  fn: (tx: AppDb) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx as unknown as AppDb);
  });
}
