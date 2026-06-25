/**
 * Apply Drizzle migrations over Neon's HTTP driver (port 443), avoiding the
 * blocked TCP 5432 path. Run: npm run db:migrate
 */
import { loadEnv, need } from "./_env";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { migrate } from "drizzle-orm/neon-http/migrator";

loadEnv();

async function main() {
  const db = drizzle(neon(need("DATABASE_URL")));
  await migrate(db, { migrationsFolder: "./lib/db/migrations" });
  console.log("✓ migrations applied");
}

main().catch((e) => {
  console.error("migration failed:", e?.message ?? e);
  process.exit(1);
});
