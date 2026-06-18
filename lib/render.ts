/**
 * Slide renderer for Instagram carousels — reliable text on-brand, because AI
 * image models render text unreliably. satori (HTML/flex → SVG) + resvg (→ PNG).
 *
 * Brand: dark #0a0a0f, neon gradient (cyan #00d4ff → violet #9d4edd → green
 * #39ff14), Inter. Output 1080×1350 (4:5), the tallest feed-friendly ratio.
 */
import fs from "fs";
import path from "path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const FONT_DIR = path.resolve(__dirname, "../assets/fonts");
const f = (file: string) => fs.readFileSync(path.join(FONT_DIR, file));

// satori dedups fonts by name+weight+style, so Latin and Cyrillic subsets can't
// share the family name (one would be dropped). Latin stays "Inter"; Cyrillic is
// a separate family kept in the list — satori falls back to it, per weight, for
// glyphs missing in the Latin subset. (Inter's variable TTF can't be used: the
// opentype fork satori bundles fails to parse its fvar/opsz axis.)
export const FONTS = [
  { name: "Inter", weight: 400 as const, style: "normal" as const, data: f("inter-latin-400-normal.woff") },
  { name: "Inter", weight: 600 as const, style: "normal" as const, data: f("inter-latin-600-normal.woff") },
  { name: "Inter", weight: 800 as const, style: "normal" as const, data: f("inter-latin-800-normal.woff") },
  { name: "Inter Cyrillic", weight: 400 as const, style: "normal" as const, data: f("inter-cyrillic-400-normal.woff") },
  { name: "Inter Cyrillic", weight: 600 as const, style: "normal" as const, data: f("inter-cyrillic-600-normal.woff") },
  { name: "Inter Cyrillic", weight: 800 as const, style: "normal" as const, data: f("inter-cyrillic-800-normal.woff") },
];

export const W = 1080;
export const H = 1350;

export const BRAND = {
  bg: "#0a0a0f",
  text: "#f5f5f7",
  dim: "#8a8a93",
  blue: "#00d4ff",
  violet: "#9d4edd",
  green: "#39ff14",
  gradient: "linear-gradient(100deg, #00d4ff 0%, #9d4edd 55%, #39ff14 100%)",
};

/** Minimal hyperscript so we can build satori trees without JSX in a .ts file. */
export type El = { type: string; props: Record<string, unknown> };
export function h(type: string, props: Record<string, unknown> = {}, children?: unknown): El {
  return { type, props: { ...props, ...(children !== undefined ? { children } : {}) } };
}

/** Rasterise a satori element tree to a PNG buffer. */
export async function renderToPng(node: El): Promise<Buffer> {
  const svg = await satori(node as unknown as React.ReactNode, {
    width: W,
    height: H,
    fonts: FONTS,
  });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng());
}

/**
 * Rasterise an element tree at an arbitrary size, transparent where unpainted
 * (resvg keeps alpha). Used for caption overlays composited onto video.
 */
export async function renderSizedPng(node: El, w: number, hh: number): Promise<Buffer> {
  const svg = await satori(node as unknown as React.ReactNode, { width: w, height: hh, fonts: FONTS });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: w } }).render().asPng());
}
