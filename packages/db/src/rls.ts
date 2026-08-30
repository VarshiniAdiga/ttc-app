import type { Sql } from "postgres";

// Bind the request's user to Postgres' `app.user_id` GUC for the duration of a
// transaction, so row-level security scopes every query inside `fn` to them.
// Use with a connection made as the non-superuser `ttc_app` role (the only way
// RLS actually binds). Phase 2's data routes call this; Phase 1's tests prove it.
export function runAsUser<T>(
  sql: Sql,
  userId: string,
  fn: (tx: Sql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}
