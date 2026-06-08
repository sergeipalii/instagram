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

  upstashUrl: () => required("UPSTASH_REDIS_REST_URL"),
  upstashToken: () => required("UPSTASH_REDIS_REST_TOKEN"),

  localTokenSecret: () => required("LOCAL_TOKEN_SECRET"),
  cronSecret: () => optional("CRON_SECRET"),

  resendApiKey: () => optional("RESEND_API_KEY"),
  alertEmail: () => optional("ALERT_EMAIL"),
};

/** Graph API version used across the app. */
export const GRAPH_VERSION = "v21.0";
/** Instagram-login Graph host (not graph.facebook.com). */
export const GRAPH_HOST = "https://graph.instagram.com";
