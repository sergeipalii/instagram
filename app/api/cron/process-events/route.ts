import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { processEvents } from "@/lib/processor";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Process-events worker. Vercel Cron hits this (schedule in vercel.json). Claims
 * a batch of queued (`received`) inbound events and processes them: filter,
 * classify, act, set terminal status. Safe to overlap — claiming uses
 * FOR UPDATE SKIP LOCKED so two runs never grab the same row.
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
    const result = await processEvents();
    if (result.errors.length) console.warn("process-events errors", result.errors);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("process-events failed", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
