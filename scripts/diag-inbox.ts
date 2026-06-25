/**
 * Read-only diagnostic for the inbound automation (DMs + comments).
 * NO writes, NO replies — just reads the live Graph API to answer:
 *   1. Which webhook fields is the account actually subscribed to?
 *   2. What DMs have come in, and did we reply?
 *   3. What comments are on our media, and did we reply / hide?
 *
 *   npm run diag:inbox
 */
import { loadEnv, need } from "./_env";

loadEnv();

const HOST = "https://graph.instagram.com";
const V = "v21.0";
const TOKEN = need("IG_LONG_LIVED_TOKEN");
const UID = need("IG_USER_ID");

async function g(path: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams({ access_token: TOKEN, ...params }).toString();
  const url = `${HOST}/${path}?${qs}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) {
    return { __error: json?.error ?? json, __status: res.status };
  }
  return json;
}

function line() {
  console.log("─".repeat(72));
}

async function main() {
  // ── Who am I ───────────────────────────────────────────────────────────────
  line();
  console.log("ACCOUNT");
  const me = await g(`${V}/me`, {
    fields: "user_id,username,account_type,followers_count,media_count",
  });
  console.log(me.__error ? `  ERROR: ${JSON.stringify(me.__error)}` : `  @${me.username}  id=${me.user_id ?? UID}  type=${me.account_type}  followers=${me.followers_count}  media=${me.media_count}`);

  // ── Webhook field subscriptions (the smoking gun) ───────────────────────────
  line();
  console.log("WEBHOOK SUBSCRIPTIONS (subscribed_apps)");
  const subs = await g(`${V}/${UID}/subscribed_apps`);
  if (subs.__error) {
    console.log(`  ERROR: ${JSON.stringify(subs.__error)}`);
  } else {
    console.log("  " + JSON.stringify(subs.data ?? subs));
  }

  // ── Conversations / DMs ─────────────────────────────────────────────────────
  line();
  console.log("DM CONVERSATIONS");
  const convos = await g(`${V}/${UID}/conversations`, {
    platform: "instagram",
    fields: "id,updated_time,participants",
    limit: "25",
  });
  if (convos.__error) {
    console.log(`  ERROR: ${JSON.stringify(convos.__error)}`);
  } else {
    const list = convos.data ?? [];
    console.log(`  ${list.length} conversation(s)`);
    for (const c of list) {
      const msgs = await g(`${V}/${c.id}`, {
        fields: "messages{id,from,message,created_time}",
      });
      const items = msgs.messages?.data ?? [];
      const others = (c.participants?.data ?? []).filter((p: any) => String(p.id) !== String(UID));
      const who = others.map((p: any) => p.username ?? p.id).join(", ") || "?";
      const fromUs = items.filter((m: any) => String(m.from?.id) === String(UID)).length;
      const fromThem = items.length - fromUs;
      console.log(`  • with ${who}: ${items.length} msg (them=${fromThem}, us=${fromUs}), updated ${c.updated_time}`);
      // newest 4 messages, oldest-first
      for (const m of items.slice(0, 4).reverse()) {
        const tag = String(m.from?.id) === String(UID) ? "US " : "THEM";
        const txt = (m.message ?? "").replace(/\s+/g, " ").slice(0, 80);
        console.log(`       [${tag}] ${txt}`);
      }
    }
  }

  // ── Media + comments ────────────────────────────────────────────────────────
  line();
  console.log("MEDIA + COMMENTS");
  const media = await g(`${V}/${UID}/media`, {
    fields: "id,caption,timestamp,comments_count",
    limit: "25",
  });
  if (media.__error) {
    console.log(`  ERROR: ${JSON.stringify(media.__error)}`);
  } else {
    const list = media.data ?? [];
    console.log(`  ${list.length} media item(s)`);
    for (const m of list) {
      const cap = (m.caption ?? "").replace(/\s+/g, " ").slice(0, 50);
      console.log(`  • ${m.id}  ${m.timestamp}  comments=${m.comments_count}  "${cap}"`);
      if (!m.comments_count) continue;
      const cs = await g(`${V}/${m.id}/comments`, {
        fields: "id,from,text,timestamp,hidden,replies{from,text}",
        limit: "50",
      });
      if (cs.__error) {
        console.log(`       comments ERROR: ${JSON.stringify(cs.__error)}`);
        continue;
      }
      for (const c of cs.data ?? []) {
        const who = c.from?.username ?? c.from?.id ?? "?";
        const txt = (c.text ?? "").replace(/\s+/g, " ").slice(0, 70);
        const replies = c.replies?.data ?? [];
        const weReplied = replies.some((r: any) => String(r.from?.id) === String(UID) || r.from?.username === me.username);
        console.log(`       [${who}] "${txt}"  hidden=${c.hidden ?? false}  ourReply=${weReplied}`);
      }
    }
  }
  line();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
