import { need } from "./_env";

/**
 * Fetch the current IG token + user id.
 * - If VERCEL_BASE_URL is set, pull the FRESH token the cron keeps in Upstash
 *   via /api/token (preferred — it never goes stale).
 * - Otherwise fall back to IG_LONG_LIVED_TOKEN + IG_USER_ID straight from
 *   .env.local (fine for local one-off publishing; the seed token can expire).
 */
export async function fetchToken(): Promise<{ token: string; userId: string }> {
  const base = process.env.VERCEL_BASE_URL?.replace(/\/$/, "");
  if (base) {
    const secret = need("LOCAL_TOKEN_SECRET");
    const res = await fetch(`${base}/api/token`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) throw new Error(`/api/token → ${res.status} ${await res.text()}`);
    const json = await res.json();
    return { token: json.access_token, userId: json.ig_user_id };
  }

  const token = process.env.IG_LONG_LIVED_TOKEN;
  const userId = process.env.IG_USER_ID;
  if (token && userId) return { token, userId };
  throw new Error(
    "Set VERCEL_BASE_URL (preferred) or IG_LONG_LIVED_TOKEN + IG_USER_ID in .env.local",
  );
}
