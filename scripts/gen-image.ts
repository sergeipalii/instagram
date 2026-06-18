/**
 * Generate an image with Gemini (Nano Banana) from the command line.
 *
 *   npm run gen:image -- --prompt "..." --out ./out.png
 *   npm run gen:image -- --prompt "..." --refs ./assets/mascot-ref --out ./mascot.png
 *   npm run gen:image -- --prompt "..." --refs a.png,b.png --aspect 1:1 --model gemini-3-pro-image
 *
 * Flags:
 *   --prompt "<text>"      generation prompt (required)
 *   --out <path>           output file (default ./gen-out.png)
 *   --refs <dir|csv>       reference images: a directory, or comma-separated paths
 *   --aspect <ratio>       e.g. 1:1, 4:5, 16:9
 *   --model <id>           override GEMINI_IMAGE_MODEL
 */
import fs from "fs";
import path from "path";
import { loadEnv } from "./_env";
import { generateImage } from "@/lib/gemini";

loadEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const IMG_RE = /\.(png|jpe?g|webp|gif)$/i;

function resolveRefs(refs: string | undefined): string[] {
  if (!refs) return [];
  if (fs.existsSync(refs) && fs.statSync(refs).isDirectory()) {
    return fs
      .readdirSync(refs)
      .filter((f) => IMG_RE.test(f))
      .sort()
      .map((f) => path.join(refs, f));
  }
  return refs.split(",").map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const prompt = arg("prompt");
  if (!prompt) {
    console.error('Missing --prompt "<text>"');
    process.exit(1);
  }
  const out = arg("out") ?? "gen-out.png";
  const refImages = resolveRefs(arg("refs"));
  const model = arg("model");
  const aspectRatio = arg("aspect");

  if (refImages.length) console.log(`→ refs: ${refImages.join(", ")}`);
  console.log(`→ generating (${model ?? "default model"})…`);

  const { data, mimeType } = await generateImage({ prompt, refImages, model, aspectRatio });

  // Make sure the extension matches what the model actually returned.
  const wantExt = mimeType.includes("jpeg") ? ".jpg" : mimeType.includes("webp") ? ".webp" : ".png";
  let outPath = out;
  if (path.extname(out).toLowerCase() !== wantExt) {
    outPath = out.replace(/\.[^.]+$/, "") + wantExt;
    console.log(`ℹ︎ model returned ${mimeType}; writing ${outPath}`);
  }
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, data);
  console.log(`✅ saved ${outPath} (${data.length} bytes, ${mimeType})`);
}

main().catch((err) => {
  console.error("❌", err.message ?? err);
  process.exit(1);
});
