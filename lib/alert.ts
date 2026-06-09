import { env } from "./env";

/**
 * Email alert to the owner (used for prohibited/threatening comments that a
 * human should review). No-op with a warning if Resend isn't configured.
 */
export async function sendAlert(subject: string, body: string): Promise<void> {
  const apiKey = env.resendApiKey();
  const to = env.alertEmail();
  if (!apiKey || !to) {
    console.warn("sendAlert skipped: RESEND_API_KEY/ALERT_EMAIL not set", { subject });
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Sepia IG <onboarding@resend.dev>",
      to: [to],
      subject,
      text: body,
    }),
  });
  if (!res.ok) {
    console.error("sendAlert failed", res.status, await res.text());
  }
}
