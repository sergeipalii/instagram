/** Centralised env access. Throws early with a clear message if a required var is missing. */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  igAppSecret: () => required("IG_APP_SECRET"),
  igUserId: () => required("IG_USER_ID"),
  igSeedToken: () => optional("IG_LONG_LIVED_TOKEN"),
  igWebhookVerifyToken: () => required("IG_WEBHOOK_VERIFY_TOKEN"),

  anthropicApiKey: () => required("ANTHROPIC_API_KEY"),
  claudeModel: () => optional("CLAUDE_MODEL", "claude-sonnet-4-6"),

  // OpenRouter — single gateway for all reply models (default + UI choice).
  openrouterKey: () => required("OPENROUTER_API_KEY"),
  defaultModel: () => optional("DEFAULT_MODEL", "anthropic/claude-sonnet-4.6"),

  // Postgres (Neon/Supabase) — inbox queue + history.
  databaseUrl: () => required("DATABASE_URL"),

  // Dashboard auth (single-user MVP): one password → signed cookie.
  dashboardPassword: () => required("DASHBOARD_PASSWORD"),
  authSecret: () => required("AUTH_SECRET"),

  // Google Gemini image/video (Nano Banana). One key covers both.
  nanoBananaKey: () => required("NANO_BANANA_KEY"),
  geminiImageModel: () => optional("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"),

  // fal.ai — video generation (ByteDance Seedance 2.0, Kling, etc.).
  falApiKey: () => required("FAL_API_KEY"),

  // Vercel's Upstash integration injects KV_REST_API_* names; the standalone
  // Upstash SDK convention is UPSTASH_REDIS_REST_*. Accept either.
  upstashUrl: () =>
    process.env.KV_REST_API_URL ??
    process.env.UPSTASH_REDIS_REST_URL ??
    (() => {
      throw new Error("Missing KV_REST_API_URL / UPSTASH_REDIS_REST_URL");
    })(),
  upstashToken: () =>
    process.env.KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    (() => {
      throw new Error("Missing KV_REST_API_TOKEN / UPSTASH_REDIS_REST_TOKEN");
    })(),

  localTokenSecret: () => required("LOCAL_TOKEN_SECRET"),
  cronSecret: () => optional("CRON_SECRET"),

  telegramBotToken: () => optional("TELEGRAM_BOT_TOKEN"),
  telegramChatId: () => optional("TELEGRAM_CHAT_ID"),
};

/** Graph API version used across the app. */
export const GRAPH_VERSION = "v21.0";
/** Instagram-login Graph host (not graph.facebook.com). */
export const GRAPH_HOST = "https://graph.instagram.com";
