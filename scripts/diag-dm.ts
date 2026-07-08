/**
 * Read-only: can we actually READ DMs via the Graph API with the LIVE token
 * (fetched from Upstash via /api/token, not the stale .env.local seed)?
 * Run: VERCEL_BASE_URL=https://inbox.sepia.software npx tsx scripts/diag-dm.ts
 */
import { loadEnv } from "./_env";
import { fetchToken } from "./_token";

loadEnv();

const HOST = "https://graph.instagram.com";
const V = "v21.0";

async function main() {
  const { token, userId } = await fetchToken();
  console.log(`token tail …${token.slice(-8)}  uid=${userId}`);

  async function g(path: string, params: Record<string, string> = {}): Promise<any> {
    const qs = new URLSearchParams({ access_token: token, ...params }).toString();
    const res = await fetch(`${HOST}/${path}?${qs}`);
    const json = await res.json();
    return res.ok ? json : { __error: json?.error ?? json, __status: res.status };
  }

  console.log("\n── /me ──");
  console.log(JSON.stringify(await g(`${V}/me`, { fields: "user_id,username,account_type" })));

  console.log("\n── subscribed_apps (fields the app is subscribed to) ──");
  console.log(JSON.stringify(await g(`${V}/${userId}/subscribed_apps`)));

  // Try several endpoint variants — narrow down WHY a DM isn't visible.
  const variants: Array<[string, string, Record<string, string>]> = [
    ["A /{uid}/conversations platform=instagram", `${V}/${userId}/conversations`, { platform: "instagram" }],
    ["B /me/conversations platform=instagram", `${V}/me/conversations`, { platform: "instagram" }],
    ["C /{uid}/conversations (no platform)", `${V}/${userId}/conversations`, {}],
    ["D /me/conversations folder=other", `${V}/me/conversations`, { platform: "instagram", folder: "other" }],
    ["E /me/conversations folder=page", `${V}/me/conversations`, { platform: "instagram", folder: "page" }],
  ];
  for (const [label, path, extra] of variants) {
    const r = await g(path, { fields: "id,updated_time", limit: "25", ...extra });
    if (r.__error) {
      console.log(`\n${label}: ERROR ${r.__status} ${JSON.stringify(r.__error)}`);
    } else {
      console.log(`\n${label}: ${(r.data ?? []).length} conversation(s)`);
    }
  }

  console.log("\n── conversations (platform=instagram) full ──");
  const convos = await g(`${V}/${userId}/conversations`, {
    platform: "instagram",
    fields: "id,updated_time,participants",
    limit: "25",
  });
  if (convos.__error) {
    console.log("ERROR:", JSON.stringify(convos.__error), "status", convos.__status);
  } else {
    const list = convos.data ?? [];
    console.log(`${list.length} conversation(s)`);
    for (const c of list) {
      const parts = (c.participants?.data ?? []).map((p: any) => p.username ?? p.id).join(", ");
      console.log(`\n• convo ${c.id}  updated ${c.updated_time}  participants: ${parts}`);
      const msgs = await g(`${V}/${c.id}`, {
        fields: "messages{id,from,message,created_time}",
      });
      if (msgs.__error) {
        console.log("  messages ERROR:", JSON.stringify(msgs.__error));
        continue;
      }
      const items = msgs.messages?.data ?? [];
      console.log(`  ${items.length} message(s):`);
      for (const m of items.slice(0, 10).reverse()) {
        const who = m.from?.username ?? m.from?.id ?? "?";
        const txt = (m.message ?? "").replace(/\s+/g, " ").slice(0, 100);
        console.log(`    [${who}] ${m.created_time}  ${txt}`);
      }
    }
  }
}

main().catch((e) => {
  console.error("FATAL", e?.message ?? e);
  process.exit(1);
});
