/**
 * Google Gemini image generation (a.k.a. "Nano Banana").
 *
 * One key (NANO_BANANA_KEY) drives generation and reference-conditioned edits.
 * Model is configurable via GEMINI_IMAGE_MODEL; current options:
 *   - gemini-2.5-flash-image  (original Nano Banana, fast, default)
 *   - gemini-3.1-flash-image  (faster, newer)
 *   - gemini-3-pro-image      (highest quality, for hero assets)
 */
import fs from "fs";
import { env } from "./env";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GenImageOptions {
  prompt: string;
  /** File paths of reference images to condition on (up to ~14). */
  refImages?: string[];
  /** Override the default model. */
  model?: string;
  /** e.g. "1:1", "4:5", "16:9". Omit to let the model decide. */
  aspectRatio?: string;
}

function mimeFromPath(p: string): string {
  const ext = p.toLowerCase().split(".").pop();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

/** Generate (or edit-from-reference) an image. Returns the raw image bytes. */
export async function generateImage(
  opts: GenImageOptions,
): Promise<{ data: Buffer; mimeType: string }> {
  const model = opts.model ?? env.geminiImageModel();
  const key = env.nanoBananaKey();

  const parts: unknown[] = [{ text: opts.prompt }];
  for (const p of opts.refImages ?? []) {
    const bytes = fs.readFileSync(p);
    parts.push({
      inline_data: { mime_type: mimeFromPath(p), data: bytes.toString("base64") },
    });
  }

  const generationConfig: Record<string, unknown> = {
    responseModalities: ["TEXT", "IMAGE"],
  };
  if (opts.aspectRatio) {
    // Gemini 3 image models take the aspect ratio under imageConfig (plain
    // "9:16" form); the older responseFormat.image enum rejects these strings.
    generationConfig.imageConfig = { aspectRatio: opts.aspectRatio };
  }

  const res = await fetch(`${API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], generationConfig }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Gemini ${model} failed (${res.status}): ${JSON.stringify(json)}`);
  }

  const outParts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
  const imgPart = outParts.find((p) => p?.inline_data?.data || p?.inlineData?.data);
  const inline = imgPart?.inline_data ?? imgPart?.inlineData;
  if (!inline?.data) {
    const textOut = outParts.find((p) => p?.text)?.text;
    throw new Error(
      `No image in Gemini response. Text: ${textOut ?? "—"}. Raw: ${JSON.stringify(json).slice(0, 600)}`,
    );
  }
  return {
    data: Buffer.from(inline.data, "base64"),
    mimeType: inline.mime_type ?? inline.mimeType ?? "image/png",
  };
}
