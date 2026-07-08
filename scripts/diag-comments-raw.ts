/**
 * Read-only: dump RAW comment responses for EVERY media, with paging cursors
 * and a few field variations. Empty `data` WITH a paging cursor = withheld;
 * empty `data` with no cursor = genuinely none. Find palii_world's comments.
 * Run: VERCEL_BASE_URL=https://inbox.sepia.software npx tsx scripts/diag-comments-raw.ts
 */
import { loadEnv } from "./_env";
import { fetchToken } from "./_token";

loadEnv();
const IGV = "v21.0";

async function main() {
  const { token, userId } = await fetchToken();
  const g = async (url: string) => {
    const res = await fetch(url);
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, j };
  };

  // Enumerate ALL media (paginate).
  let next = `https://graph.instagram.com/${IGV}/${userId}/media?fields=id,timestamp,comments_count,caption&limit=50&access_token=${encodeURIComponent(token)}`;
  const media: any[] = [];
  while (next) {
    const { ok, j } = await g(next);
    if (!ok) { console.log("media ERROR", JSON.stringify(j)); break; }
    media.push(...(j.data ?? []));
    next = j.paging?.next ?? "";
  }
  console.log(`total media: ${media.length}\n`);

  for (const m of media) {
    const cap = (m.caption ?? "").replace(/\s+/g, " ").slice(0, 40);
    console.log(`━━ media ${m.id}  ${m.timestamp}  comments_count=${m.comments_count}  "${cap}"`);
    if (!m.comments_count) continue;

    // Variation A: full fields
    const a = await g(`https://graph.instagram.com/${IGV}/${m.id}/comments?fields=id,from,username,text,timestamp&limit=50&access_token=${encodeURIComponent(token)}`);
    console.log(`   [A id,from,username,text] status=${a.status} data=${(a.j.data ?? []).length} hasCursor=${Boolean(a.j.paging?.cursors || a.j.paging?.next)}`);
    if (a.j.__error || a.j.error) console.log("      err:", JSON.stringify(a.j.error ?? a.j.__error));
    for (const c of a.j.data ?? []) console.log(`      • [${c.username ?? c.from?.username ?? c.from?.id ?? "?"}] ${(c.text ?? "").slice(0, 60)}`);

    // Variation B: minimal fields (in case `from` is the gate)
    const b = await g(`https://graph.instagram.com/${IGV}/${m.id}/comments?fields=id,text&limit=50&access_token=${encodeURIComponent(token)}`);
    console.log(`   [B id,text only]        status=${b.status} data=${(b.j.data ?? []).length} hasCursor=${Boolean(b.j.paging?.cursors || b.j.paging?.next)}`);

    // Variation C: no fields param at all
    const c = await g(`https://graph.instagram.com/${IGV}/${m.id}/comments?limit=50&access_token=${encodeURIComponent(token)}`);
    console.log(`   [C no fields]           status=${c.status} data=${(c.j.data ?? []).length}  rawKeys=${Object.keys(c.j).join(",")}`);
    if ((c.j.data ?? []).length) console.log("      raw:", JSON.stringify(c.j.data).slice(0, 300));
  }
}

main().catch((e) => { console.error("FATAL", e?.message ?? e); process.exit(1); });
