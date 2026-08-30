// Seed the dev DB with the two fake, pre-linked users the dev login shim drives.
// Idempotent — safe to re-run. Uses the superuser connection (bypasses RLS).
//   node --experimental-strip-types src/seed.ts   (or: npm run db:seed)
import { config } from "dotenv";
import postgres from "postgres";

config({ path: new URL("../../../apps/server/.dev.vars", import.meta.url).pathname });

const HER = "11111111-1111-1111-1111-111111111111";
const HIM = "22222222-2222-2222-2222-222222222222";

const sql = postgres(process.env.DATABASE_URL || "", { max: 1 });

try {
  await sql`insert into "user" (id, name, email) values
    (${HER}, 'Her', 'her@dev.local'),
    (${HIM}, 'Him', 'him@dev.local')
    on conflict (id) do nothing`;

  await sql`insert into profile (user_id, display_name, role) values
    (${HER}, 'Her', 'her'), (${HIM}, 'Him', 'him')
    on conflict (user_id) do nothing`;

  const [c] = await sql`insert into couple (member_a, member_b) values (${HER}, ${HIM})
    on conflict (member_a, member_b) do update set member_a = excluded.member_a
    returning id`;
  const coupleId = c!.id;

  // Default-OFF consent rows, one per shareable category.
  await sql`insert into sharing_consent (couple_id, owner_id, category) values
    (${coupleId}, ${HER}, 'cycle'), (${coupleId}, ${HER}, 'bbt'), (${coupleId}, ${HER}, 'opk'),
    (${coupleId}, ${HER}, 'mucus'), (${coupleId}, ${HER}, 'symptom'), (${coupleId}, ${HIM}, 'habit')
    on conflict (couple_id, owner_id, category) do nothing`;

  console.log(`Seeded Her (${HER}) + Him (${HIM}), couple ${coupleId}, consent default-OFF.`);
} finally {
  await sql.end();
}
