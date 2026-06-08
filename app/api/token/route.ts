import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getToken, tokenRefreshedAt } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Secret-protected endpoint the LOCAL publishing script calls to fetch the
 * current IG token. Vercel owns the token; the local side never stores its own.
 *
 * Auth: header `Authorization: Bearer <LOCAL_TOKEN_SECRET>`.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.replace(/^Bearer\s+/i, "");
  if (!provided || provided !== env.localTokenSecret()) {
    return new Response("Unauthorized", { status: 401 });
  }

  const token = await getToken();
  return Response.json({
    access_token: token,
    ig_user_id: env.igUserId(),
    refreshed_at: await tokenRefreshedAt(),
  });
}
