/**
 * Debug: tail the `events` table — see whether webhook deliveries reach the DB.
 * Run: npx tsx scripts/db-events-tail.ts [limit]
 */
import { loadEnv, need } from "./_env";
import { neon } from "@neondatabase/serverless";

loadEnv();

async function main() {
  const limit = Number(process.argv[2] ?? 10);
  const sql = neon(need("DATABASE_URL"));
  const [{ count }] = await sql`select count(*)::int as count from events`;
  console.log(`events total: ${count}`);
  const rows = await sql`
    select e.created_at, c.kind, e.direction, e.status, e.ignored,
           e.ignored_reason, e.author, left(e.text, 60) as text, e.external_id
    from events e
    join conversations c on c.id = e.conversation_id
    order by e.created_at desc
    limit ${limit}
  `;
  console.table(rows);

  const [{ count: dcount }] = await sql`select count(*)::int as count from webhook_deliveries`;
  console.log(`\nwebhook_deliveries total: ${dcount}`);
  const deliveries = await sql`
    select received_at, object, handled_count,
           left(raw::text, 90) as raw_preview
    from webhook_deliveries
    order by received_at desc
    limit ${limit}
  `;
  console.table(deliveries);
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
