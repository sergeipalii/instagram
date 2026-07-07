/**
 * Carousel slide template (hybrid neon + mascot, dark). Builds a satori element
 * tree for one slide. Keep text reliable here; the mascot is a transparent PNG.
 */
import fs from "fs";
import path from "path";
import { h, El, BRAND, W, H } from "./render";

const ACCENT = { blue: BRAND.blue, violet: BRAND.violet, green: BRAND.green };

const POSE_DIR = path.resolve(__dirname, "../assets/mascot-poses");
const POSE_W = 168; // default small top-right accent

/** Load a transparent mascot pose by filename → data URI + scaled dims. */
function pose(file: string, targetW = POSE_W): { src: string; w: number; h: number } {
  const buf = fs.readFileSync(path.join(POSE_DIR, file));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20); // PNG IHDR
  return {
    src: `data:image/png;base64,${buf.toString("base64")}`,
    w: targetW,
    h: Math.round((targetW * h) / w),
  };
}

export interface SlideSpec {
  kind: "cover" | "body" | "cta";
  /** Small uppercase label above the title. */
  eyebrow?: string;
  title: string;
  /** Secondary line under the title, dimmer (e.g. the "reality" of a myth). */
  subtitle?: string;
  /** Accent line under the title: e.g. "листай →", "ссылка в шапке". */
  footnote?: string;
  accent?: keyof typeof ACCENT;
  /** Unique mascot pose for this slide — filename in assets/mascot-poses/. */
  mascot?: string;
  /** Override mascot width (px) and top offset for this slide. */
  mascotW?: number;
  mascotTop?: number;
  /** Override the title font size (e.g. for long text). */
  size?: number;
  /** Constrain the text column width (px) — e.g. to clear a side graphic. */
  width?: number;
  /**
   * Post-render art composited with 'screen' blend (for translucent pieces like
   * water on a black bg). Handled by render-carousel, not satori. Coords/size in
   * px on the 1080×1350 canvas; file lives in assets/mascot-poses/.
   */
  screen?: { file: string; w: number; x: number; y: number };
  /**
   * App screenshot (pre-rendered with neon glow via `npm run prep:shot`),
   * composited post-satori by render-carousel. file is relative to
   * assets/posts/<id>/_shots/; x/y is the top-left on the 1080×1350 canvas.
   */
  shot?: { file: string; x: number; y: number };
}

const PAD = 96;

function brandRow(): El {
  return h("div", { style: { display: "flex", alignItems: "center", gap: 16 } }, [
    h("div", { style: { width: 22, height: 22, borderRadius: 11, backgroundImage: BRAND.gradient } }),
    h("div", {
      style: { display: "flex", fontFamily: "Inter", fontWeight: 600, fontSize: 30, letterSpacing: 1, color: BRAND.dim },
    }, "sepia.software"),
  ]);
}

export function slide(spec: SlideSpec, index: number, total: number): El {
  const accent = ACCENT[spec.accent ?? "blue"];
  const titleSize = spec.size ?? (spec.kind === "cover" ? 86 : spec.kind === "cta" ? 74 : 60);

  const main: El[] = [
    h("div", { style: { display: "flex", width: 96, height: 10, borderRadius: 6, backgroundImage: BRAND.gradient } }),
  ];
  if (spec.eyebrow) {
    main.push(
      h("div", {
        style: { display: "flex", fontFamily: "Inter", fontWeight: 600, fontSize: 28, letterSpacing: 6, color: accent },
      }, spec.eyebrow.toUpperCase()),
    );
  }
  main.push(
    h("div", {
      style: {
        display: "flex",
        fontFamily: "Inter",
        fontWeight: 800,
        fontSize: titleSize,
        lineHeight: 1.1,
        letterSpacing: -0.5,
        color: BRAND.text,
        ...(spec.width ? { maxWidth: spec.width } : {}),
      },
    }, spec.title),
  );
  if (spec.subtitle) {
    main.push(
      h("div", {
        style: {
          display: "flex",
          fontFamily: "Inter",
          fontWeight: 600,
          fontSize: 40,
          lineHeight: 1.3,
          color: accent,
          marginTop: 6,
        },
      }, spec.subtitle),
    );
  }
  if (spec.footnote) {
    // "→" has no glyph in the Inter subset — strip it and draw a neon triangle.
    const hasArrow = /→\s*$/.test(spec.footnote);
    const text = spec.footnote.replace(/\s*→\s*$/, "");
    const row: El[] = [
      h("div", { style: { display: "flex", fontFamily: "Inter", fontWeight: 700, fontSize: 34, color: accent } }, text),
    ];
    if (hasArrow) {
      const tri = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26'><path d='M5 3 L22 13 L5 23 Z' fill='${accent.replace("#", "%23")}'/></svg>`;
      row.push(h("img", { src: tri, width: 26, height: 26 }));
    }
    main.push(
      h("div", { style: { display: "flex", alignItems: "center", gap: 14, marginTop: 8 } }, row),
    );
  }

  const children: El[] = [
    brandRow(),
    h("div", {
      style: { display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 30, ...(spec.width ? { maxWidth: spec.width } : {}) },
    }, main),
    // footer: page number only
    h("div", {
      style: { display: "flex", fontFamily: "Inter", fontWeight: 600, fontSize: 26, color: BRAND.dim },
    }, `${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}`),
  ];
  if (spec.mascot) {
    const m = pose(spec.mascot, spec.mascotW);
    children.push(
      h("img", {
        src: m.src,
        width: m.w,
        height: m.h,
        style: { position: "absolute", top: spec.mascotTop ?? 150, right: PAD },
      }),
    );
  }

  return h("div", {
    style: {
      position: "relative",
      width: W,
      height: H,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: PAD,
      background: BRAND.bg,
      backgroundImage: `radial-gradient(1100px 700px at 92% -10%, ${accent}22 0%, transparent 60%)`,
    },
  }, children);
}
