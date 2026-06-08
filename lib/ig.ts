import { env, GRAPH_HOST, GRAPH_VERSION } from "./env";
import { getToken, setToken } from "./store";

/** Low-level GET against the Instagram Graph host. */
async function igGet(path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH_HOST}/${path}?${qs}`);
  const json = await res.json();
  if (!res.ok) throw new Error(`IG GET ${path} failed: ${JSON.stringify(json)}`);
  return json;
}

/** Low-level POST against the Instagram Graph host (form-encoded). */
async function igPost(path: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`${GRAPH_HOST}/${GRAPH_VERSION}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`IG POST ${path} failed: ${JSON.stringify(json)}`);
  return json;
}

/**
 * Exchange the current long-lived token for a fresh one (resets the ~60-day
 * clock). Called by the Vercel cron. Persists the result.
 */
export async function refreshToken(): Promise<{ token: string; expiresIn: number }> {
  const current = await getToken();
  const json = await igGet("refresh_access_token", {
    grant_type: "ig_refresh_token",
    access_token: current,
  });
  await setToken(json.access_token);
  return { token: json.access_token, expiresIn: json.expires_in };
}

/** Send a text DM reply to a user (within the 24-hour messaging window). */
export async function sendMessage(recipientId: string, text: string): Promise<void> {
  const token = await getToken();
  await igPost(`${env.igUserId()}/messages`, {
    recipient: JSON.stringify({ id: recipientId }),
    message: JSON.stringify({ text }),
    access_token: token,
  });
}

// ─── Publishing (used by the local script via direct calls) ──────────────────
// These take userId explicitly so the local script can pass the id it got from
// /api/token, without needing IG_USER_ID in its own env.

/** Create a media container for a single image. Returns the container id. */
export async function createImageContainer(
  token: string,
  userId: string,
  imageUrl: string,
  caption: string,
): Promise<string> {
  const json = await igPost(`${userId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: token,
  });
  return json.id;
}

/** Create a Reels container. Returns the container id (must be polled). */
export async function createReelContainer(
  token: string,
  userId: string,
  videoUrl: string,
  caption: string,
): Promise<string> {
  const json = await igPost(`${userId}/media`, {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    access_token: token,
  });
  return json.id;
}

/** Poll a container's status. Returns FINISHED | IN_PROGRESS | ERROR | EXPIRED. */
export async function containerStatus(token: string, containerId: string): Promise<string> {
  const json = await igGet(`${GRAPH_VERSION}/${containerId}`, {
    fields: "status_code",
    access_token: token,
  });
  return json.status_code;
}

/** Publish a finished container. Returns the published media id. */
export async function publishContainer(
  token: string,
  userId: string,
  containerId: string,
): Promise<string> {
  const json = await igPost(`${userId}/media_publish`, {
    creation_id: containerId,
    access_token: token,
  });
  return json.id;
}
