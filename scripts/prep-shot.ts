/**
 * Prepare an app screenshot for a slide: resize → rounded corners → soft neon
 * glow, output as a transparent PNG (glow + rounded shot, padded canvas) ready
 * to composite onto a dark slide.
 *
 *   npm run prep:shot -- --in shot.png --out _shots/home.png --w 470
 *
 * Flags:
 *   --in <path>     source screenshot (required)
 *   --out <path>    output transparent png (required)
 *   --w <px>        screenshot width (default 470)
 *   --pad <px>      glow padding around the shot (default 70)
 *   --radius <px>   corner radius (default 44)
 *   --glow <hex>    glow colour (default #00d4ff, brand blue)
 *   --blur <sigma>  glow blur (default 34)
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
    console.error("Usage: --in <src> --out <dst> [--w 470]");
    process.exit(1);
  }
  const w = Number(arg("w") ?? 470);
  const pad = Number(arg("pad") ?? 70);
  const radius = Number(arg("radius") ?? 44);
  const glow = arg("glow") ?? "#00d4ff";
  const blur = Number(arg("blur") ?? 34);

  // 1. resize the screenshot
  const base = await sharp(inPath).resize({ width: w }).png().toBuffer();
  const h = (await sharp(base).metadata()).height ?? 0;

  // 2. round the corners (SVG rounded-rect as alpha mask)
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" ry="${radius}"/></svg>`,
  );
  const rounded = await sharp(base)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  // 3. neon silhouette = glow colour masked by the rounded alpha
  const solid = await sharp({
    create: { width: w, height: h, channels: 4, background: glow },
  })
    .png()
    .toBuffer();
  const sil = await sharp(solid)
    .composite([{ input: rounded, blend: "dest-in" }])
    .png()
    .toBuffer();

  // 4. glow layer: silhouette placed on a padded transparent canvas, blurred
  const cw = w + pad * 2, ch = h + pad * 2;
  const glowLayer = await sharp({
    create: { width: cw, height: ch, channels: 4, background: "#00000000" },
  })
    .composite([{ input: sil, left: pad, top: pad }])
    .blur(blur)
    .png()
    .toBuffer();

  // 5. final: glow behind + sharp rounded shot on top (composite twice for punch)
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  await sharp(glowLayer)
    .composite([
      { input: glowLayer, left: 0, top: 0 },
      { input: rounded, left: pad, top: pad },
    ])
    .png()
    .toFile(path.resolve(outPath));

  console.log(`✅ ${outPath} (${cw}x${ch}, shot ${w}x${h}, glow ${glow})`);
}

main().catch((e) => {
  console.error("❌", e.message ?? e);
  process.exit(1);
});
