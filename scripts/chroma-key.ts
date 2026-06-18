/**
 * Chroma-key a solid-green background to true transparency, trim, save PNG.
 *   npm run chroma -- --in ./assets/_mascot-green.jpg --out ./assets/mascot-cutout.png
 *
 * Keys pixels where green dominates red/blue, with a soft edge band, and
 * suppresses green spill on semi-transparent edges.
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const T_HIGH = Number(arg("high") ?? 60); // diff above this → fully keyed
const T_LOW = Number(arg("low") ?? 20); // diff below this → fully opaque

async function main() {
  const input = arg("in");
  const output = arg("out") ?? "cutout.png";
  if (!input) {
    console.error("Missing --in <green-screen image>");
    process.exit(1);
  }

  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const diff = g - Math.max(r, b);
    let a = 255;
    if (diff > T_HIGH) a = 0;
    else if (diff > T_LOW) a = Math.round((255 * (T_HIGH - diff)) / (T_HIGH - T_LOW));
    if (a > 0 && g > Math.max(r, b)) data[i + 1] = Math.max(r, b); // de-spill
    data[i + 3] = a;
  }

  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .trim()
    .toFile(output);

  const m = await sharp(output).metadata();
  console.log(`✅ ${output} (${m.width}×${m.height}, hasAlpha=${m.hasAlpha})`);
}

main().catch((e) => {
  console.error("❌", e.message ?? e);
  process.exit(1);
});
