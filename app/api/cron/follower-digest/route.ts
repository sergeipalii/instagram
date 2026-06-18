import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getAccountStats } from "@/lib/ig";
import { getLastFollowers, setLastFollowers } from "@/lib/store";
import { sendAlert } from "@/lib/alert";

export const runtime = "nodejs";

/**
 * Daily follower digest. Vercel Cron hits this (schedule in vercel.json).
 * Reads followers_count, compares to yesterday's stored value, sends the delta
 * to Telegram, and stores today's value. The API gives only the count, not who.
 */
export async function GET(req: NextRequest) {
  const secret = env.cronSecret();
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const { followers, media } = await getAccountStats();
    const prev = await getLastFollowers();
    await setLastFollowers(followers);

    let line: string;
    if (prev === null) {
      line = `📊 Подписчики: ${followers} (первое измерение)`;
    } else {
      const delta = followers - prev;
      const sign = delta > 0 ? `+${delta}` : `${delta}`;
      const emoji = delta > 0 ? "📈" : delta < 0 ? "📉" : "➖";
      line = `${emoji} Подписчики: ${followers} (${sign} за сутки)`;
    }

    await sendAlert(`${line}\nПостов: ${media}`);
    return Response.json({ ok: true, followers, media, prev });
  } catch (err) {
    console.error("follower digest failed", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
