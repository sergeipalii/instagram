import { env } from "./env";

/**
 * Telegram alert to the owner (used for prohibited/threatening comments that a
 * human should review). No-op with a warning if the bot isn't configured.
 */
export async function sendAlert(text: string): Promise<void> {
  const token = env.telegramBotToken();
  const chatId = env.telegramChatId();
  if (!token || !chatId) {
    console.warn("sendAlert skipped: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set");
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    console.error("sendAlert failed", res.status, await res.text());
  }
}
