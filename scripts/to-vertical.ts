/**
 * Pad a (white-background) keyframe onto a vertical 9:16 canvas, with the
 * character sitting in the lower area and empty white space on top for a caption.
 *
 *   npm run to:vertical -- --in raw.png --out vert.png
 *   npm run to:vertical -- --in raw.png --out vert.png --char 980 --bottom 220
 *
 * Flags:
 *   --in <path>      source keyframe (required)
 *   --out <path>     output 1080x1920 png (required)
 *   --char <px>      width to scale the character to (default 1000)
 *   --center-y <px>  vertical centre of the character (default 1000 — centred,
 *                    leaving caption room on top and IG-UI room at the bottom)
 *   --bottom <px>    fallback: bottom margin if --center-y is not given
 *   --w <px>         canvas width  (default 1080)
 *   --h <px>         canvas height (default 1920)
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const inPath = arg("in");
  const outPath = arg("out");
  if (!inPath || !outPath) {
    console.error("Usage: --in <src> --out <dst> [--char 980] [--bottom 220]");
    process.exit(1);
  }
  const W = Number(arg("w") ?? 1080);
  const H = Number(arg("h") ?? 1920);
  const charW = Number(arg("char") ?? 1000);
  const centerYArg = arg("center-y");
  const bottom = Number(arg("bottom") ?? 220);

  // Materialise the resized art first (so extract/sampling has real dimensions).
  const art0 = await sharp(inPath)
    .flatten({ background: "#ffffff" })
    .resize({ width: charW })
    .toBuffer();

  // Sample the darkest-likely background (a top-left corner patch; the character
  // is centred so the corner is plain paper) to calibrate a white-point lift.
  const corner = await sharp(art0)
    .extract({ left: 0, top: 0, width: 40, height: 40 })
    .resize(1, 1)
    .raw()
    .toBuffer();
  const c = 0.299 * corner[0] + 0.587 * corner[1] + 0.114 * corner[2];

  // Lift highlights so the paper cream + vignette clamp to pure white, while the
  // black ink stays dark. Clamp everything from (corner - 30) upward to white, so
  // texture/vignette slightly darker than the sampled corner still goes white.
  const slope = 1.2;
  const intercept = 255 - slope * (c - 30);
  const art = await sharp(art0).linear(slope, intercept).toBuffer();
  const artH = (await sharp(art).metadata()).height ?? 0;

  const left = Math.round((W - charW) / 2);
  // Centre vertically on --center-y (default 1000), else fall back to bottom margin.
  const centerY = centerYArg != null ? Number(centerYArg) : 1000;
  const top =
    centerYArg != null || arg("bottom") == null
      ? Math.max(0, Math.round(centerY - artH / 2))
      : Math.max(0, H - bottom - artH);

  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  await sharp({
    create: { width: W, height: H, channels: 3, background: "#ffffff" },
  })
    .composite([{ input: art, left, top }])
    .png()
    .toFile(path.resolve(outPath));

  console.log(`✅ ${outPath} (${W}x${H}, char ${charW}px, top ${top}px)`);
}

main().catch((err) => {
  console.error("❌", err.message ?? err);
  process.exit(1);
});
