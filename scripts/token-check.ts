/** Quick check that the local side can fetch the IG token from Vercel. */
import { loadEnv, need } from "./_env";

loadEnv();

async function main() {
  const base = need("VERCEL_BASE_URL").replace(/\/$/, "");
  const secret = need("LOCAL_TOKEN_SECRET");
  const res = await fetch(`${base}/api/token`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`❌ ${res.status}`, json);
    process.exit(1);
  }
  console.log("✅ token endpoint OK");
  console.log("   ig_user_id: ", json.ig_user_id);
  console.log("   refreshed_at:", json.refreshed_at ?? "(never — using seed)");
  console.log("   token:        …" + String(json.access_token).slice(-8));
}

main();
