import { env } from "@ttc/env/server";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export * from "./schema";
export * from "./app-db";
export * from "./invite";

export function createDb() {
  const client = postgres(env.DATABASE_URL || "", { max: 1 });

  return drizzle({ client, schema });
}
