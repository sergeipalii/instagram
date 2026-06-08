import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { refreshToken } from "@/lib/ig";

export const runtime = "nodejs";

/**
 * Vercel Cron hits this (schedule in vercel.json). Refreshes the long-lived IG
 * token so it never hits the ~60-day expiry. Vercel sends an Authorization
 * header with CRON_SECRET on production cron invocations.
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
    const { expiresIn } = await refreshToken();
    return Response.json({ ok: true, expires_in: expiresIn });
  } catch (err) {
    console.error("token refresh failed", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
