/**
 * Render the reel end-card (invite to play, demo mode) as a crisp PNG.
 * Text via satori+resvg (AI image models mangle text). 1080x1920 (9:16).
 *
 *   npx tsx scripts/gen-endcard.ts            # -> assets/games-on-knee/scenes/endcard_v1.png
 *   npx tsx scripts/gen-endcard.ts --en       # English variant
 *   npx tsx scripts/gen-endcard.ts --out p.png
 */
import fs from "fs";
import path from "path";
import { h, renderSizedPng } from "@/lib/render";

const EN = process.argv.includes("--en");
const outArg = (() => {
  const i = process.argv.indexOf("--out");
  return i !== -1 ? process.argv[i + 1] : undefined;
})();

const C = {
  bg: "#0E0A07",
  text: "#F2EAE0",
  dim: "#9A8E80",
  faint: "#7A6E60",
  sub: "#C9BEB0",
  orange: "#E8902E",
  dark: "#1A1208",
};

const T = EN
  ? {
      brand: "VIBE JAM",
      sub2: "ИГРЫ НА КОЛЕНКЕ",
      a: "HUMANS",
      vs: "vs",
      b: "AI",
      tagline: "Talk an AI character into buying what it doesn't need",
      cta: "PLAY — LINK IN BIO",
      foot: "demo · free · bugs & ideas welcome",
    }
  : {
      brand: "ИГРЫ НА КОЛЕНКЕ",
      sub2: "VIBE JAM",
      a: "ЛЮДИ",
      vs: "против",
      b: "ИИ",
      tagline: "Убеди ИИ-персонажа купить то, что ему совсем не нужно",
      cta: "ИГРАТЬ — ССЫЛКА В ПРОФИЛЕ",
      foot: "демо · всё бесплатно · баги и идеи приветствуются",
    };

const font = "Inter, 'Inter Cyrillic'";

const tree = h(
  "div",
  {
    style: {
      width: 1080,
      height: 1920,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: C.bg,
      padding: "150px 90px",
      fontFamily: font,
    },
  },
  [
    // brand
    h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center" } }, [
      h("div", { style: { fontSize: 48, fontWeight: 800, color: C.orange, letterSpacing: 4 } }, T.brand),
      h("div", { style: { fontSize: 26, fontWeight: 600, color: C.faint, letterSpacing: 10, marginTop: 12 } }, T.sub2),
    ]),
    // hook
    h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center" } }, [
      h("div", { style: { fontSize: 168, fontWeight: 800, color: C.text, lineHeight: 1 } }, T.a),
      h("div", { style: { fontSize: 64, fontWeight: 600, color: C.dim, marginTop: 8, marginBottom: 8 } }, T.vs),
      h("div", { style: { fontSize: 168, fontWeight: 800, color: C.orange, lineHeight: 1 } }, T.b),
      h(
        "div",
        {
          style: {
            display: "flex",
            width: 860,
            textAlign: "center",
            fontSize: 42,
            fontWeight: 400,
            color: C.sub,
            marginTop: 56,
            lineHeight: 1.35,
          },
        },
        T.tagline,
      ),
    ]),
    // cta + footer
    h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center" } }, [
      h(
        "div",
        {
          style: {
            display: "flex",
            backgroundColor: C.orange,
            color: C.dark,
            fontSize: 44,
            fontWeight: 800,
            padding: "36px 64px",
            borderRadius: 22,
          },
        },
        T.cta,
      ),
      h("div", { style: { fontSize: 30, fontWeight: 400, color: C.faint, marginTop: 44 } }, T.foot),
    ]),
  ],
);

async function main() {
  const out = outArg ?? `assets/games-on-knee/${EN ? "en" : "ru"}/endcard_${EN ? "en" : "ru"}_v1.png`;
  const png = await renderSizedPng(tree, 1080, 1920);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, png);
  console.log(`✅ saved ${out} (${(png.length / 1024).toFixed(0)} KB)`);
}

main().catch((e) => {
  console.error("❌", e.message ?? e);
  process.exit(1);
});
