import fs from "fs";
import path from "path";
import { forceIpv4 } from "@/lib/net-ipv4";

// Apply the IPv4 connect fix for every local script (Neon HTTP, etc.).
forceIpv4();

/**
 * Minimal .env loader for local scripts (Next loads env automatically, plain
 * tsx scripts do not). Reads .env.local then .env from the project root.
 * Does not overwrite vars already present in the real environment.
 */
export function loadEnv(): void {
  const root = path.resolve(__dirname, "..");
  for (const file of [".env.local", ".env"]) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}

export function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name} (set it in .env.local)`);
  return v;
}
