import { Redis } from "@upstash/redis";
import { env } from "./env";

let _redis: Redis | null = null;
function redis(): Redis {
  if (!_redis) {
    _redis = new Redis({ url: env.upstashUrl(), token: env.upstashToken() });
  }
  return _redis;
}

const TOKEN_KEY = "ig:token";
const TOKEN_REFRESHED_AT = "ig:token:refreshed_at";

/**
 * Current long-lived IG token. Vercel is the single source of truth.
 * Falls back to the seed env var if the store is empty (first run).
 */
export async function getToken(): Promise<string> {
  const stored = await redis().get<string>(TOKEN_KEY);
  if (stored) return stored;
  const seed = env.igSeedToken();
  if (seed) {
    await redis().set(TOKEN_KEY, seed);
    return seed;
  }
  throw new Error("No IG token in store and no IG_LONG_LIVED_TOKEN seed set");
}

export async function setToken(token: string): Promise<void> {
  await redis().set(TOKEN_KEY, token);
  await redis().set(TOKEN_REFRESHED_AT, new Date().toISOString());
}

export async function tokenRefreshedAt(): Promise<string | null> {
  return redis().get<string>(TOKEN_REFRESHED_AT);
}

/**
 * Webhook dedup: Meta may redeliver the same event. Returns true if this id
 * was already seen (so the caller can skip it). TTL keeps the set bounded.
 */
export async function seenBefore(id: string, ttlSeconds = 86_400): Promise<boolean> {
  const key = `ig:seen:${id}`;
  // NX set → returns null if it already existed.
  const res = await redis().set(key, "1", { nx: true, ex: ttlSeconds });
  return res === null;
}
