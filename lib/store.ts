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

/** True when Upstash is configured (Vercel). Local dev usually has neither. */
function upstashConfigured(): boolean {
  return Boolean(
    (process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL) &&
      (process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN),
  );
}

/**
 * Current long-lived IG token. Vercel (Upstash) is the single source of truth.
 * When Upstash isn't configured (local dev) fall back straight to the env seed
 * so scripts and the local server can call the Graph API.
 */
export async function getToken(): Promise<string> {
  if (!upstashConfigured()) {
    const seed = env.igSeedToken();
    if (seed) return seed;
    throw new Error("No Upstash configured and no IG_LONG_LIVED_TOKEN seed set");
  }
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

const FOLLOWERS_KEY = "ig:followers:last";

/** Last recorded follower count (for the daily digest delta). null on first run. */
export async function getLastFollowers(): Promise<number | null> {
  return redis().get<number>(FOLLOWERS_KEY);
}

export async function setLastFollowers(count: number): Promise<void> {
  await redis().set(FOLLOWERS_KEY, count);
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
