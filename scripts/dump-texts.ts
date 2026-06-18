/**
 * Собирает тексты всех каруселей (слайды + подписи) в один Markdown для удобной
 * вычитки/модерации. Источник правды остаётся в content/carousels.ts и
 * content/captions.ts — этот файл только для чтения.
 *   npm run dump:texts   →   content/REVIEW.md
 */
import fs from "fs";
import path from "path";
import { CAROUSELS } from "../content/carousels";
import { CAPTIONS } from "../content/captions";

// Статус и заголовок по каждому id (для шапки раздела).
const META: Record<string, { title: string; status: string }> = {
  "01-intro": { title: "№1 · Знакомство", status: "опубликован · закреплён" },
  "02-myths": { title: "№2 · 5 мифов", status: "опубликован" },
  "04-ai-vs-human": { title: "№4 · Что ИИ делает отлично / где нужен человек", status: "черновик" },
  "06-formats": { title: "№6 · Форматы работы", status: "опубликован · закреплён" },
  "12-audit-signs": { title: "№12 · 3 признака, что нужен аудит", status: "черновик" },
};

// Порядок вывода (по номеру поста).
const ORDER = ["01-intro", "02-myths", "04-ai-vs-human", "06-formats", "12-audit-signs"];

const out: string[] = [
  "# Тексты каруселей — для модерации",
  "",
  "> Источник правды: `content/carousels.ts` (слайды) + `content/captions.ts` (подписи).",
  "> Этот файл генерируется: `npm run dump:texts`. Правки вносим в источник, потом перерендер.",
  "",
];

for (const id of ORDER) {
  const slides = CAROUSELS[id];
  if (!slides) continue;
  const meta = META[id] ?? { title: id, status: "" };
  out.push(`---`, "", `## ${meta.title}`, "", `**id:** \`${id}\` · **статус:** ${meta.status} · **слайдов:** ${slides.length}`, "");

  slides.forEach((s, i) => {
    const n = String(i + 1).padStart(2, "0");
    const tag = s.kind === "cover" ? "обложка" : s.kind === "cta" ? "CTA" : "слайд";
    out.push(`### ${n} — ${tag}${s.eyebrow ? ` · ${s.eyebrow}` : ""}`, "");
    out.push(`**${s.title}**`, "");
    if (s.subtitle) out.push(s.subtitle, "");
    if (s.footnote) out.push(`_${s.footnote}_`, "");
  });

  out.push(`### Подпись (caption)`, "", "```", (CAPTIONS[id] ?? "—").trim(), "```", "");
}

const dest = path.resolve("content/REVIEW.md");
fs.writeFileSync(dest, out.join("\n"));
console.log(`✅ ${dest}`);
