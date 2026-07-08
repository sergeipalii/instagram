/**
 * Read-only capability probe with the LIVE token (Upstash via /api/token).
 * Goal: LOCALIZE why inbound data isn't visible — establish facts, not guesses.
 *   1. Which scopes are actually granted to this token? (debug_token)
 *   2. Does the comment-read path return CONTENT (not just counts)?
 *   3. Does the DM path return anything?
 * Run: VERCEL_BASE_URL=https://inbox.sepia.software npx tsx scripts/diag-caps.ts
 */
import { loadEnv } from "./_env";
import { fetchToken } from "./_token";

loadEnv();

const APP_ID = process.env.IG_APP_ID ?? "2522494308927026";
const APP_SECRET = process.env.IG_APP_SECRET ?? "";
const IGV = "v21.0";

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  return res.ok ? json : { __error: json?.error ?? json, __status: res.status };
}

async function main() {
  const { token, userId } = await fetchToken();
  console.log(`token tail …${token.slice(-8)}  uid=${userId}\n`);

  // ── 1. Token introspection: which scopes are granted? ──────────────────────
  console.log("═══ 1. TOKEN SCOPES (debug_token) ═══");
  if (APP_SECRET) {
    // Try Facebook graph first (classic debug_token), then instagram graph.
    const fb = await getJson(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${APP_ID}|${APP_SECRET}`,
    );
    console.log("graph.facebook.com/debug_token:", JSON.stringify(fb).slice(0, 800));
    const ig = await getJson(
      `https://graph.instagram.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${APP_ID}|${APP_SECRET}`,
    );
    console.log("graph.instagram.com/debug_token:", JSON.stringify(ig).slice(0, 800));
  } else {
    console.log("  (no IG_APP_SECRET in env — skipping)");
  }
  // Instagram-Login tokens expose permissions on /me directly on some versions:
  const mePerms = await getJson(
    `https://graph.instagram.com/${IGV}/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(token)}`,
  );
  console.log("me:", JSON.stringify(mePerms));

  // ── 2. Comment-read path: do we get CONTENT, or just counts? ───────────────
  console.log("\n═══ 2. COMMENTS (content vs count) ═══");
  const media = await getJson(
    `https://graph.instagram.com/${IGV}/${userId}/media?fields=id,timestamp,comments_count&limit=10&access_token=${encodeURIComponent(token)}`,
  );
  if (media.__error) {
    console.log("media ERROR:", JSON.stringify(media.__error));
  } else {
    for (const m of media.data ?? []) {
      if (!m.comments_count) continue;
      const cs = await getJson(
        `https://graph.instagram.com/${IGV}/${m.id}/comments?fields=id,from,text,timestamp&limit=50&access_token=${encodeURIComponent(token)}`,
      );
      const n = cs.__error ? `ERROR ${JSON.stringify(cs.__error)}` : `${(cs.data ?? []).length} returned`;
      console.log(`  media ${m.id}: comments_count=${m.comments_count} → API ${n}`);
      for (const c of cs.data ?? []) {
        console.log(`      [${c.from?.username ?? c.from?.id ?? "?"}] ${(c.text ?? "").slice(0, 60)}`);
      }
    }
  }

  // ── 3. DM path ─────────────────────────────────────────────────────────────
  console.log("\n═══ 3. CONVERSATIONS ═══");
  const convos = await getJson(
    `https://graph.instagram.com/${IGV}/${userId}/conversations?platform=instagram&fields=id,updated_time,participants&limit=25&access_token=${encodeURIComponent(token)}`,
  );
  console.log(convos.__error ? `ERROR: ${JSON.stringify(convos.__error)}` : `${(convos.data ?? []).length} conversation(s): ${JSON.stringify(convos.data ?? [])}`);
}

main().catch((e) => {
  console.error("FATAL", e?.message ?? e);
  process.exit(1);
});
