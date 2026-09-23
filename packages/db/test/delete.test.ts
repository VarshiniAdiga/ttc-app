import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import postgres, { type Sql } from "postgres";

// Phase 9 — the delete-everything promise: deleting the user row must leave ZERO
// residual rows in any table that references them. This proves the FK cascade
// actually reaches all of it. Own throwaway DB so it can hard-delete freely.
const HOST = process.env.TEST_PG_HOST ?? "localhost:54322";
const SUPER = `postgresql://postgres:postgres@${HOST}`;
const TEST_DB = "ttc_test_delete";
const superUrl = `${SUPER}/${TEST_DB}`;

const HER = "11111111-1111-1111-1111-111111111111";
const HIM = "22222222-2222-2222-2222-222222222222";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../src/migrations");

let db: Sql;

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

  db = postgres(superUrl, { max: 1 });
  await applyMigrations(db);

  // A fully-populated couple: her logs + his log + couple-scoped rows + auth rows.
  await db`insert into "user" (id, name, email) values (${HER}, 'Her', 'her@d.local'), (${HIM}, 'Him', 'him@d.local')`;
  await db`insert into profile (user_id, display_name, role) values (${HER}, 'Her', 'her'), (${HIM}, 'Him', 'him')`;
  const [c] = await db`insert into couple (member_a, member_b) values (${HER}, ${HIM}) returning id`;
  const coupleId = c!.id;
  await db`insert into sharing_consent (couple_id, owner_id, category, granted) values (${coupleId}, ${HER}, 'cycle', true)`;
  await db`insert into cycle_log (user_id, date, flow) values (${HER}, '2026-08-01', 'medium')`;
  await db`insert into bbt_log (user_id, date, temp_c) values (${HER}, '2026-08-01', 36.6)`;
  await db`insert into opk_log (user_id, date, result) values (${HER}, '2026-08-01', 'peak')`;
  await db`insert into mucus_log (user_id, date, type) values (${HER}, '2026-08-01', 'eggwhite')`;
  await db`insert into symptom_log (user_id, date, symptoms) values (${HER}, '2026-08-01', '["cramps"]'::jsonb)`;
  await db`insert into habit_log (user_id, date, alcohol_units) values (${HIM}, '2026-08-01', 2)`;
  await db`insert into todo (couple_id, created_by, title) values (${coupleId}, ${HER}, 'Book doctor')`;
  await db`insert into invite (token, inviter_id, expires_at) values ('tok', ${HER}, now() + interval '1 day')`;
  await db`insert into coaching (couple_id, user_id, rule_id, rule_version, body, week_of) values (${coupleId}, ${HER}, 'r1', 1, 'text', '2026-08-01')`;
  await db`insert into entitlement (user_id, product, is_pro) values (${HER}, 'pro', true)`;
  await db`insert into session (id, expires_at, token, updated_at, user_id) values ('s1', now() + interval '1 day', 'st', now(), ${HER})`;
  await db`insert into account (id, issuer, account_id, provider_id, user_id, updated_at) values ('a1', 'credential', ${HER}, 'credential', ${HER}, now())`;
}, 60_000);

afterAll(async () => {
  await db?.end();
});

const rows = async (q: postgres.PendingQuery<postgres.Row[]>) =>
  Number((await q)[0]!.n as number);

test("deleting her user cascades to zero residual rows for her data", async () => {
  await db`delete from "user" where id = ${HER}`;

  // Directly owned rows: gone.
  for (const t of ["cycle_log", "bbt_log", "opk_log", "mucus_log", "symptom_log"]) {
    expect({ t, n: await rows(db`select count(*)::int as n from ${db(t)} where user_id = ${HER}`) }).toEqual({ t, n: 0 });
  }
  expect(await rows(db`select count(*)::int as n from profile where user_id = ${HER}`)).toBe(0);
  expect(await rows(db`select count(*)::int as n from entitlement where user_id = ${HER}`)).toBe(0);
  expect(await rows(db`select count(*)::int as n from session where user_id = ${HER}`)).toBe(0);
  expect(await rows(db`select count(*)::int as n from account where user_id = ${HER}`)).toBe(0);
  expect(await rows(db`select count(*)::int as n from invite where inviter_id = ${HER}`)).toBe(0);

  // Couple-scoped rows (couple, its consent/todo/coaching) hang off the couple,
  // which is deleted because she was a member — so all are gone table-wide.
  for (const t of ["couple", "sharing_consent", "todo", "coaching"]) {
    expect({ t, n: await rows(db`select count(*)::int as n from ${db(t)}`) }).toEqual({ t, n: 0 });
  }

  // Him and his own data survive — delete is scoped to her account only.
  expect(await rows(db`select count(*)::int as n from profile where user_id = ${HIM}`)).toBe(1);
  expect(await rows(db`select count(*)::int as n from habit_log where user_id = ${HIM}`)).toBe(1);
});
