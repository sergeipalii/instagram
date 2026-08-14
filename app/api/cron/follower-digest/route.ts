import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getAccountStats } from "@/lib/ig";
import { getLastFollowers, setLastFollowers } from "@/lib/store";
import { sendAlert } from "@/lib/alert";

export const runtime = "nodejs";

/**
 * Follower digest — **отключён 2026-08-14 по решению владельца.**
 *
 * Расписание убрано из vercel.json, поэтому само оно больше не срабатывает:
 * ежедневное «Подписчики: N (+K за сутки)» в Telegram прекращено. Роут оставлен
 * рабочим — его можно дёрнуть руками, если счётчик когда-нибудь понадобится
 * разово; чтобы вернуть ежедневную отправку, достаточно добавить запись обратно
 * в crons.
 *
 * Что делает: читает followers_count, сравнивает со вчерашним сохранённым
 * значением, шлёт дельту в Telegram и сохраняет сегодняшнее. API отдаёт только
 * число, не список.
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
