/**
 * Render a carousel's slides to PNGs.
 *   npm run render:carousel -- 01-intro
 * Slides are defined in content/carousels.ts. Output → assets/posts/<id>/NN.png
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { renderToPng } from "@/lib/render";
import { slide } from "@/lib/slides";
import { CAROUSELS } from "../content/carousels";

const POSE_DIR = path.resolve("assets/mascot-poses");

async function main() {
  const id = process.argv[2];
  const carousel = id ? CAROUSELS[id] : undefined;
  if (!carousel) {
    console.error(`Unknown carousel "${id}". Known: ${Object.keys(CAROUSELS).join(", ")}`);
    process.exit(1);
  }

  const outDir = path.resolve(`assets/posts/${id}`);
  fs.mkdirSync(outDir, { recursive: true });
  const total = carousel.length;

  for (let i = 0; i < total; i++) {
    const spec = carousel[i];
    let png = await renderToPng(slide(spec, i + 1, total));
    // Screen-blend translucent art (e.g. water on black) over the rendered slide.
    if (spec.screen) {
      const ov = await sharp(path.join(POSE_DIR, spec.screen.file))
        .resize({ width: spec.screen.w })
        .toBuffer();
      png = await sharp(png)
        .composite([{ input: ov, left: spec.screen.x, top: spec.screen.y, blend: "screen" }])
        .png()
        .toBuffer();
    }
    // Composite a prepped app screenshot (rounded + neon glow) over the slide.
    if (spec.shot) {
      const ov = fs.readFileSync(path.join(outDir, "_shots", spec.shot.file));
      png = await sharp(png)
        .composite([{ input: ov, left: spec.shot.x, top: spec.shot.y }])
        .png()
        .toBuffer();
    }
    const file = path.join(outDir, `${String(i + 1).padStart(2, "0")}.png`);
    fs.writeFileSync(file, png);
    console.log(`✅ ${file}`);
  }
}

main().catch((err) => {
  console.error("❌", err.message ?? err);
  process.exit(1);
});
