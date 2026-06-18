/**
 * fal.ai video generation — ByteDance Seedance 2.0 (image-to-video).
 *
 * Flow: submit to the fal QUEUE API → poll status → fetch result → download mp4.
 * Auth header: "Authorization: Key <FAL_API_KEY>".
 * The start frame is sent inline as a base64 data URI (no public URL needed).
 *
 * COST: the API response carries no billing data, so we estimate locally from a
 * per-second price table (see PRICE_PER_SEC). Authoritative spend is on the fal
 * dashboard — our number is a close estimate for planning, not the invoice.
 */
import fs from "fs";
import { env } from "./env";

export type FalTier = "fast" | "standard";

const MODEL_ID: Record<FalTier, string> = {
  fast: "bytedance/seedance-2.0/fast/image-to-video",
  standard: "bytedance/seedance-2.0/image-to-video",
};

/**
 * USD per second of output, by tier + resolution. 720p/1080p are fal's published
 * rates; 480p is derived from the pixel-count ratio (~0.44× of 720p). Estimates.
 */
const PRICE_PER_SEC: Record<FalTier, Record<string, number>> = {
  fast: { "480p": 0.108, "720p": 0.242 },
  standard: { "480p": 0.135, "720p": 0.3034, "1080p": 0.682 },
};

export function estimateCost(
  tier: FalTier,
  resolution: string,
  durationSec: number,
): number | null {
  const rate = PRICE_PER_SEC[tier]?.[resolution];
  if (rate == null || !Number.isFinite(durationSec)) return null;
  return Math.round(rate * durationSec * 10000) / 10000;
}

function mimeFromPath(p: string): string {
  const ext = p.toLowerCase().split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

function dataUri(p: string): string {
  const b = fs.readFileSync(p);
  return `data:${mimeFromPath(p)};base64,${b.toString("base64")}`;
}

export interface GenVideoOptions {
  tier?: FalTier; // default "fast"
  imagePath: string; // start frame
  endImagePath?: string; // optional end frame (transition)
  prompt: string;
  resolution?: string; // "480p" | "720p" | "1080p" (default "720p")
  duration?: number | "auto"; // seconds 4–15, default 5
  aspectRatio?: string; // default "auto"
  generateAudio?: boolean; // default false (silent cartoon)
  seed?: number;
  onStatus?: (s: string) => void;
}

export interface GenVideoResult {
  data: Buffer;
  url: string;
  seed: number;
  tier: FalTier;
  resolution: string;
  duration: number | "auto";
  costUsd: number | null;
}

const QUEUE_BASE = "https://queue.fal.run";

export async function generateVideo(opts: GenVideoOptions): Promise<GenVideoResult> {
  const tier = opts.tier ?? "fast";
  const resolution = opts.resolution ?? "720p";
  const duration = opts.duration ?? 5;
  const key = env.falApiKey();
  const modelId = MODEL_ID[tier];
  const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" };

  const input: Record<string, unknown> = {
    prompt: opts.prompt,
    image_url: dataUri(opts.imagePath),
    resolution,
    aspect_ratio: opts.aspectRatio ?? "auto",
    generate_audio: opts.generateAudio ?? false,
  };
  if (duration !== "auto") input.duration = String(duration);
  if (opts.endImagePath) input.end_image_url = dataUri(opts.endImagePath);
  if (opts.seed != null) input.seed = opts.seed;

  // 1. submit to queue
  const submit = await fetch(`${QUEUE_BASE}/${modelId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  const submitJson: any = await submit.json();
  if (!submit.ok) {
    throw new Error(`fal submit failed (${submit.status}): ${JSON.stringify(submitJson)}`);
  }
  const statusUrl: string = submitJson.status_url;
  const responseUrl: string = submitJson.response_url;
  if (!statusUrl || !responseUrl) {
    throw new Error(`fal: missing status/response url: ${JSON.stringify(submitJson)}`);
  }

  // 2. poll until done (video gen ~30s–3min)
  const started = Date.now();
  const TIMEOUT_MS = 6 * 60 * 1000;
  let last = "";
  for (;;) {
    if (Date.now() - started > TIMEOUT_MS) throw new Error("fal: timed out waiting for video");
    const st = await fetch(statusUrl, { headers });
    const stJson: any = await st.json();
    const status = stJson.status ?? "UNKNOWN";
    if (status !== last) {
      last = status;
      opts.onStatus?.(status);
    }
    if (status === "COMPLETED") break;
    if (status === "FAILED" || status === "ERROR") {
      throw new Error(`fal job failed: ${JSON.stringify(stJson)}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  // 3. fetch result
  const res = await fetch(responseUrl, { headers });
  const resJson: any = await res.json();
  if (!res.ok) throw new Error(`fal result failed (${res.status}): ${JSON.stringify(resJson)}`);
  const url: string = resJson?.video?.url;
  if (!url) throw new Error(`fal: no video url: ${JSON.stringify(resJson).slice(0, 400)}`);
  const seed: number = resJson?.seed ?? -1;

  // 4. download mp4
  const dl = await fetch(url);
  if (!dl.ok) throw new Error(`fal: video download failed (${dl.status})`);
  const data = Buffer.from(await dl.arrayBuffer());

  return {
    data,
    url,
    seed,
    tier,
    resolution,
    duration,
    costUsd: estimateCost(tier, resolution, typeof duration === "number" ? duration : NaN),
  };
}
