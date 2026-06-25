import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Neon HTTP driver: SQL over HTTPS (port 443). Chosen over the TCP driver
// because port 5432 is not reliably reachable from some networks. Works on
// node + edge; each query is a stateless HTTPS request.
const globalForDb = globalThis as unknown as { _db?: NeonHttpDatabase<typeof schema> };

function getDb(): NeonHttpDatabase<typeof schema> {
  if (!globalForDb._db) {
    globalForDb._db = drizzle(neon(env.databaseUrl()), { schema });
  }
  return globalForDb._db;
}

// Proxy so `db.select()` etc. initialize the real client on first access — keeps
// `next build` from needing DATABASE_URL at import time.
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_t, prop) {
    const real = getDb() as any;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
