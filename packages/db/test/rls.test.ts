import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres, { type Sql } from "postgres";

import { runAsUser } from "../src/rls";

// Uses the already-running local Supabase Postgres (docker, port 54322).
// Everything happens in a throwaway `ttc_test` database, isolated from dev data.
const HOST = process.env.TEST_PG_HOST ?? "localhost:54322";
const SUPER = `postgresql://postgres:postgres@${HOST}`;
const TEST_DB = "ttc_test";
const superUrl = `${SUPER}/${TEST_DB}`;
const appUrl = `postgresql://ttc_app:ttc_app_dev@${HOST}/${TEST_DB}`;

const HER = "11111111-1111-1111-1111-111111111111";
const HIM = "22222222-2222-2222-2222-222222222222";
const STRANGER = "33333333-3333-3333-3333-333333333333";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../src/migrations");

let db: Sql; // superuser (fixtures)
let app: Sql; // ttc_app role (RLS applies)
let coupleId: string;

async function applyMigrations(sql: Sql) {
  const journal = JSON.parse(readFileSync(join(migrationsDir, "meta/_journal.json"), "utf8"));
  for (const entry of journal.entries) {
    const file = readFileSync(join(migrationsDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of file.split("--> statement-breakpoint")) {
      if (stmt.trim()) await sql.unsafe(stmt);
    }
  }
}

async function seed(sql: Sql) {
  await sql`insert into "user" (id, name, email) values
    (${HER}, 'Her', 'her@test.local'),
    (${HIM}, 'Him', 'him@test.local'),
    (${STRANGER}, 'Stranger', 'stranger@test.local')`;
  await sql`insert into profile (user_id, display_name, role) values
    (${HER}, 'Her', 'her'), (${HIM}, 'Him', 'him'), (${STRANGER}, 'Stranger', 'her')`;
  const [c] = await sql`insert into couple (member_a, member_b) values (${HER}, ${HIM}) returning id`;
  coupleId = c!.id;
  // Her logs (one per category) + one of his.
  await sql`insert into cycle_log (user_id, date, flow) values (${HER}, '2026-08-01', 'medium')`;
  await sql`insert into bbt_log (user_id, date, temp_c) values (${HER}, '2026-08-01', 36.6)`;
  await sql`insert into opk_log (user_id, date, result) values (${HER}, '2026-08-01', 'peak')`;
  await sql`insert into mucus_log (user_id, date, type) values (${HER}, '2026-08-01', 'eggwhite')`;
  await sql`insert into symptom_log (user_id, date, symptoms) values (${HER}, '2026-08-01', ${JSON.stringify(["cramps"])}::jsonb)`;
  await sql`insert into habit_log (user_id, date, alcohol_units) values (${HIM}, '2026-08-01', 2)`;
  // Consent rows exist but all default OFF.
  await sql`insert into sharing_consent (couple_id, owner_id, category) values
    (${coupleId}, ${HER}, 'cycle'), (${coupleId}, ${HER}, 'bbt'), (${coupleId}, ${HER}, 'opk'),
    (${coupleId}, ${HER}, 'mucus'), (${coupleId}, ${HER}, 'symptom'), (${coupleId}, ${HIM}, 'habit')`;
}

const count = async (sql: Sql, table: string, viewer: string) =>
  runAsUser(sql, viewer, async (tx) => Number((await tx`select count(*)::int as n from ${tx(table)}`)[0]!.n));

const setConsent = (owner: string, category: string, granted: boolean) =>
  runAsUser(app, owner, (tx) => tx`update sharing_consent set granted = ${granted} where owner_id = ${owner} and category = ${category}`);

beforeAll(async () => {
  const maint = postgres(`${SUPER}/postgres`, { max: 1 });
  await maint`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${TEST_DB} and pid <> pg_backend_pid()`;
  await maint.unsafe(`drop database if exists ${TEST_DB}`);
  await maint.unsafe(`create database ${TEST_DB}`);
  await maint.end();

  db = postgres(superUrl, { max: 1 });
  await applyMigrations(db);
  await seed(db);
  app = postgres(appUrl, { max: 1 });
}, 60_000);

afterAll(async () => {
  await app?.end();
  await db?.end();
});

describe("owner access", () => {
  test("her sees her own cycle data", async () => {
    expect(await count(app, "cycle_log", HER)).toBe(1);
  });
  test("him sees his own habit data", async () => {
    expect(await count(app, "habit_log", HIM)).toBe(1);
  });
});

describe("partner access is default-deny", () => {
  test("him sees none of her data before consent", async () => {
    for (const t of ["cycle_log", "bbt_log", "opk_log", "mucus_log", "symptom_log"]) {
      expect(await count(app, t, HIM)).toBe(0);
    }
  });
  test("her sees none of his habit data before consent", async () => {
    expect(await count(app, "habit_log", HER)).toBe(0);
  });
});

describe("consent grants exactly one category", () => {
  test("granting cycle reveals only cycle, not bbt", async () => {
    await setConsent(HER, "cycle", true);
    expect(await count(app, "cycle_log", HIM)).toBe(1);
    expect(await count(app, "bbt_log", HIM)).toBe(0);
  });
  test("revoking cuts access immediately", async () => {
    await setConsent(HER, "cycle", false);
    expect(await count(app, "cycle_log", HIM)).toBe(0);
  });
  test("his habit consent reveals it to her", async () => {
    await setConsent(HIM, "habit", true);
    expect(await count(app, "habit_log", HER)).toBe(1);
    await setConsent(HIM, "habit", false);
    expect(await count(app, "habit_log", HER)).toBe(0);
  });
});

describe("unrelated users see nothing", () => {
  test("stranger sees no data even with her consent granted", async () => {
    await setConsent(HER, "cycle", true);
    for (const t of ["cycle_log", "bbt_log", "opk_log", "mucus_log", "symptom_log", "habit_log"]) {
      expect(await count(app, t, STRANGER)).toBe(0);
    }
    await setConsent(HER, "cycle", false);
  });
  test("no app.user_id set means no rows", async () => {
    const rows = await app`select count(*)::int as n from cycle_log`;
    expect(Number(rows[0]!.n)).toBe(0);
  });
});

describe("partner cannot write to owner's data", () => {
  test("him cannot insert a cycle_log as her", async () => {
    await setConsent(HER, "cycle", true);
    await expect(
      runAsUser(app, HIM, (tx) => tx`insert into cycle_log (user_id, date, flow) values (${HER}, '2026-09-01', 'light')`),
    ).rejects.toThrow();
    await setConsent(HER, "cycle", false);
  });
});

describe("shared to-dos (Phase 6)", () => {
  test("both members see a couple todo; stranger does not", async () => {
    await runAsUser(app, HER, (tx) =>
      tx`insert into todo (couple_id, created_by, title) values (${coupleId}, ${HER}, 'Book doctor')`);
    expect(await count(app, "todo", HER)).toBe(1);
    expect(await count(app, "todo", HIM)).toBe(1);
    expect(await count(app, "todo", STRANGER)).toBe(0);
  });
  test("a stranger cannot insert into the couple's list", async () => {
    await expect(
      runAsUser(app, STRANGER, (tx) =>
        tx`insert into todo (couple_id, created_by, title) values (${coupleId}, ${STRANGER}, 'sneak')`),
    ).rejects.toThrow();
  });
});

describe("identity and shared tables", () => {
  test("partner can read partner profile; stranger cannot", async () => {
    expect(await count(app, "profile", HIM)).toBeGreaterThanOrEqual(2); // own + her
    expect(await count(app, "profile", STRANGER)).toBe(1); // only own
  });
  test("both members see the couple row; stranger does not", async () => {
    expect(await count(app, "couple", HER)).toBe(1);
    expect(await count(app, "couple", HIM)).toBe(1);
    expect(await count(app, "couple", STRANGER)).toBe(0);
  });
});
