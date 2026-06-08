import fs from "fs";
import path from "path";
import { need } from "./_env";

/**
 * Turn a media input into a PUBLIC URL that Meta's servers can fetch.
 * - If `input` is already an http(s) URL, it's returned unchanged.
 * - If it's a local file path, it's uploaded to Sanity's asset CDN and the
 *   resulting public URL is returned.
 */
export async function resolveMediaUrl(input: string, kind: "image" | "video"): Promise<string> {
  if (/^https?:\/\//i.test(input)) return input;

  if (!fs.existsSync(input)) {
    throw new Error(`Media not found and not a URL: ${input}`);
  }

  const projectId = need("SANITY_PROJECT_ID");
  const dataset = need("SANITY_DATASET");
  const token = need("SANITY_WRITE_TOKEN");

  const assetType = kind === "video" ? "files" : "images";
  const filename = path.basename(input);
  const body = fs.readFileSync(input);

  const res = await fetch(
    `https://${projectId}.api.sanity.io/v2021-06-07/assets/${assetType}/${dataset}?filename=${encodeURIComponent(filename)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body,
    },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`Sanity upload failed: ${JSON.stringify(json)}`);

  const url: string | undefined = json?.document?.url;
  if (!url) throw new Error(`Sanity upload returned no url: ${JSON.stringify(json)}`);
  return url;
}
