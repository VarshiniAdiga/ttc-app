import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres, { type Sql } from "postgres";

import { acceptInvite, createInvite, InviteError } from "../src/invite";
import { sharingConsent } from "../src/schema";

// Own throwaway DB (separate from rls.test's ttc_test so the files can run in
// parallel). Exercises the couple + consent creation and the expiry/single-use
// guards — the security-sensitive part of the invite flow.
const HOST = process.env.TEST_PG_HOST ?? "localhost:54322";
const SUPER = `postgresql://postgres:postgres@${HOST}`;
const TEST_DB = "ttc_test_invite";

const HER = "11111111-1111-1111-1111-111111111111";
const HIM = "22222222-2222-2222-2222-222222222222";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../src/migrations");

let raw: Sql;
let db: ReturnType<typeof drizzle>;

async function applyMigrations(sql: Sql) {
  const journal = JSON.parse(readFileSync(join(migrationsDir, "meta/_journal.json"), "utf8"));
  for (const entry of journal.entries) {
    const file = readFileSync(join(migrationsDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of file.split("--> statement-breakpoint")) {
      if (stmt.trim()) await sql.unsafe(stmt);
    }
  }
}

beforeAll(async () => {
  const maint = postgres(`${SUPER}/postgres`, { max: 1 });
  await maint`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${TEST_DB} and pid <> pg_backend_pid()`;
  await maint.unsafe(`drop database if exists ${TEST_DB}`);
  await maint.unsafe(`create database ${TEST_DB}`);
  await maint.end();

  raw = postgres(`${SUPER}/${TEST_DB}`, { max: 1 });
  await applyMigrations(raw);
  await raw`insert into "user" (id, name, email) values
    (${HER}, 'Her', 'her@test.local'), (${HIM}, 'Him', 'him@test.local')`;
  db = drizzle({ client: raw });
}, 60_000);

afterAll(async () => {
  await raw?.end();
});

describe("acceptInvite", () => {
  test("creates the couple and writes the chosen consent rows", async () => {
    const { token } = await createInvite(db as never, HER, ["fertile_window"]);
    const { coupleId } = await acceptInvite(db as never, token, HIM);

    const cpl = await raw`select * from couple where id = ${coupleId}`;
    expect(cpl.length).toBe(1);

    const consent = await db
      .select()
      .from(sharingConsent)
      .where(and(eq(sharingConsent.ownerId, HER), eq(sharingConsent.category, "fertile_window")));
    expect(consent[0]?.granted).toBe(true);
  });

  test("rejects a second use of the same token", async () => {
    const { token } = await createInvite(db as never, HER, []);
    await acceptInvite(db as never, token, HIM);
    await expect(acceptInvite(db as never, token, HIM)).rejects.toMatchObject({ status: 409 });
  });

  test("rejects an expired invite", async () => {
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const { token } = await createInvite(db as never, HER, [], past);
    await expect(acceptInvite(db as never, token, HIM)).rejects.toMatchObject({ status: 410 });
  });

  test("rejects accepting your own invite", async () => {
    const { token } = await createInvite(db as never, HER, []);
    await expect(acceptInvite(db as never, token, HER)).rejects.toBeInstanceOf(InviteError);
  });

  test("unknown token is not found", async () => {
    await expect(acceptInvite(db as never, "nope", HIM)).rejects.toMatchObject({ status: 404 });
  });
});
