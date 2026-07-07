/**
 * Local Instagram publisher — run from your machine, with a confirm step.
 *
 *   npm run publish:ig -- --image ./post.jpg --caption "Текст поста"
 *   npm run publish:ig -- --reel ./reel.mp4 --caption "..." --yes
 *   npm run publish:ig -- --image https://cdn.../already-public.jpg --caption "..."
 *
 * Flags:
 *   --image <path|url>   publish a single image
 *   --reel  <path|url>   publish a Reel (video)
 *   --caption "<text>"   caption / description
 *   --yes                skip the confirm prompt (for future local cron)
 *
 * Token + IG user id are pulled from the Vercel deployment (/api/token).
 * Local files are uploaded to Sanity CDN first (Meta needs a public URL).
 */
import readline from "readline";
import { loadEnv, need } from "./_env";
import { resolveMediaUrl } from "./upload";
import {
  createImageContainer,
  createReelContainer,
  containerStatus,
  publishContainer,
} from "@/lib/ig";

loadEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function fetchToken(): Promise<{ token: string; userId: string }> {
  // Local fallback: if no Vercel base is configured, use the long-lived token
  // and user id straight from the local env (.env.local seed).
  if (!process.env.VERCEL_BASE_URL) {
    return { token: need("IG_LONG_LIVED_TOKEN"), userId: need("IG_USER_ID") };
  }
  const base = need("VERCEL_BASE_URL").replace(/\/$/, "");
  const secret = need("LOCAL_TOKEN_SECRET");
  const res = await fetch(`${base}/api/token`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) throw new Error(`/api/token → ${res.status} ${await res.text()}`);
  const json = await res.json();
  return { token: json.access_token, userId: json.ig_user_id };
}

function confirm(question: string): Promise<boolean> {
  if (flag("yes")) return Promise.resolve(true);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (a) => {
      rl.close();
      resolve(/^y(es)?$/i.test(a.trim()));
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const caption = arg("caption") ?? "";
  const image = arg("image");
  const reel = arg("reel");

  if (!image && !reel) {
    console.error("Specify --image <path|url> or --reel <path|url>");
    process.exit(1);
  }

  console.log("→ Fetching token from Vercel…");
  const { token, userId } = await fetchToken();

  const kind = reel ? "video" : "image";
  const source = (reel ?? image)!;
  console.log(`→ Resolving media (${kind})…`);
  const mediaUrl = await resolveMediaUrl(source, kind);

  console.log("\n──────── PREVIEW ────────");
  console.log(`Type:    ${reel ? "Reel" : "Image"}`);
  console.log(`Media:   ${mediaUrl}`);
  console.log(`Caption: ${caption || "(empty)"}`);
  console.log("─────────────────────────\n");

  if (!(await confirm("Publish this now? [y/N] "))) {
    console.log("Cancelled.");
    return;
  }

  let containerId: string;
  if (reel) {
    console.log("→ Creating Reel container…");
    containerId = await createReelContainer(token, userId, mediaUrl, caption);
    // Reels are processed async — poll until FINISHED.
    process.stdout.write("→ Processing");
    for (let i = 0; i < 60; i++) {
      const status = await containerStatus(token, containerId);
      if (status === "FINISHED") break;
      if (status === "ERROR" || status === "EXPIRED") {
        throw new Error(`Container ${status}`);
      }
      process.stdout.write(".");
      await sleep(5000);
    }
    process.stdout.write("\n");
  } else {
    console.log("→ Creating image container…");
    containerId = await createImageContainer(token, userId, mediaUrl, caption);
  }

  console.log("→ Publishing…");
  const mediaId = await publishContainer(token, userId, containerId);
  console.log(`✅ Published. Media id: ${mediaId}`);
}

main().catch((err) => {
  console.error("❌", err.message ?? err);
  process.exit(1);
});
