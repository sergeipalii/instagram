/**
 * Publish a rendered carousel to Instagram.
 *
 *   npm run publish:carousel -- --post 01-intro
 *   npm run publish:carousel -- --dir ./assets/posts/01-intro --caption "..." --yes
 *
 * Flags:
 *   --post <id>     use assets/posts/<id>/*.png + caption from content/captions.ts
 *   --dir  <path>   explicit slide directory (PNGs, sorted by name)
 *   --caption "..." caption override (otherwise from content/captions.ts)
 *   --yes           skip the confirm prompt
 *
 * Each slide is uploaded to a public CDN (Sanity) first — Meta fetches media by
 * URL. Token + IG user id come from the Vercel deployment (/api/token).
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import sharp from "sharp";
import { loadEnv } from "./_env";
import { fetchToken } from "./_token";
import { resolveMediaUrl } from "./upload";
import {
  createCarouselImageChild,
  createCarouselContainer,
  containerStatus,
  publishContainer,
} from "@/lib/ig";
import { CAPTIONS } from "../content/captions";

loadEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function confirm(q: string): Promise<boolean> {
  if (flag("yes")) return Promise.resolve(true);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(/^y(es)?$/i.test(a.trim())); }));
}

function slideFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+\.(png|jpe?g)$/i.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

async function main() {
  const post = arg("post");
  const dir = arg("dir") ?? (post ? `assets/posts/${post}` : undefined);
  if (!dir) { console.error("Specify --post <id> or --dir <path>"); process.exit(1); }

  const caption = arg("caption") ?? (post ? CAPTIONS[post] : undefined) ?? "";
  const files = slideFiles(dir);
  if (files.length < 2 || files.length > 10) {
    console.error(`Carousel needs 2–10 slides, found ${files.length} in ${dir}`);
    process.exit(1);
  }

  console.log("→ Fetching token from Vercel…");
  const { token, userId } = await fetchToken();

  // Instagram requires JPEG for feed media — convert slides before upload.
  const buildDir = path.join(dir, ".publish");
  fs.mkdirSync(buildDir, { recursive: true });

  console.log(`→ Converting + uploading ${files.length} slides to CDN…`);
  const urls: string[] = [];
  for (const f of files) {
    const jpg = path.join(buildDir, path.basename(f).replace(/\.[^.]+$/, ".jpg"));
    await sharp(f).flatten({ background: "#0a0a0f" }).jpeg({ quality: 92 }).toFile(jpg);
    urls.push(await resolveMediaUrl(jpg, "image"));
    process.stdout.write(".");
  }
  process.stdout.write("\n");

  console.log("\n──────── PREVIEW ────────");
  console.log(`Slides:  ${files.length}`);
  files.forEach((f, i) => console.log(`  ${i + 1}. ${path.basename(f)}`));
  console.log(`Caption: ${caption.slice(0, 120)}${caption.length > 120 ? "…" : ""}`);
  console.log("─────────────────────────\n");

  if (!(await confirm("Publish this carousel now? [y/N] "))) {
    console.log("Cancelled.");
    return;
  }

  console.log("→ Creating slide containers…");
  const childIds: string[] = [];
  for (const url of urls) childIds.push(await createCarouselImageChild(token, userId, url));

  console.log("→ Creating carousel container…");
  const containerId = await createCarouselContainer(token, userId, childIds, caption);

  // Carousel containers process asynchronously — wait for FINISHED before publishing.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  process.stdout.write("→ Processing");
  for (let i = 0; i < 30; i++) {
    const status = await containerStatus(token, containerId);
    if (status === "FINISHED") break;
    if (status === "ERROR" || status === "EXPIRED") throw new Error(`Container ${status}`);
    process.stdout.write(".");
    await sleep(3000);
  }
  process.stdout.write("\n");

  console.log("→ Publishing…");
  const mediaId = await publishContainer(token, userId, containerId);
  console.log(`✅ Published. Media id: ${mediaId}`);
}

main().catch((err) => {
  console.error("❌", err.message ?? err);
  process.exit(1);
});
