/**
 * Generate a video from a start-frame image via fal.ai (Seedance 2.0).
 *
 *   npm run gen:video -- --image assets/mascot-toon/02-laptop.jpg --prompt "..."
 *   npm run gen:video -- --image 03-shock.jpg --prompt-file p.txt --tier fast --res 720p --dur 5 --aspect 16:9
 *   npm run gen:video -- --summary        # print the spend ledger and exit
 *
 * Flags:
 *   --image <path>        start frame (required)
 *   --end-image <path>    optional end frame (transition)
 *   --prompt "<text>"     motion prompt (or use --prompt-file)
 *   --prompt-file <path>  read the prompt from a file
 *   --tier fast|standard  default fast
 *   --res 480p|720p|1080p default 720p (1080p = standard tier only)
 *   --dur <4-15|auto>     default 5
 *   --aspect <ratio>      default auto (e.g. 9:16, 16:9, 1:1)
 *   --audio               enable AI audio (default off — silent cartoon)
 *   --out <path>          output mp4 (default assets/video-out/<name>-<tier>-<res>-<ts>.mp4)
 *   --summary             print the cost ledger and exit
 *
 * Every successful generation appends a line to assets/video-out/ledger.jsonl
 * and prints the per-clip cost + running total, so spend stays visible.
 */
import fs from "fs";
import path from "path";
import { loadEnv } from "./_env";
import { generateVideo, estimateCost } from "@/lib/fal";
import type { FalTier } from "@/lib/fal";

loadEnv();

const LEDGER = path.resolve("assets/video-out/ledger.jsonl");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function readLedger(): any[] {
  if (!fs.existsSync(LEDGER)) return [];
  return fs
    .readFileSync(LEDGER, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function printSummary(): void {
  const rows = readLedger();
  if (!rows.length) {
    console.log("Ledger empty — no generations yet.");
    return;
  }
  let total = 0;
  console.log("\n #  date              tier/res         dur   cost     file");
  rows.forEach((r, i) => {
    total += r.costUsd ?? 0;
    console.log(
      `${String(i + 1).padStart(2)}  ${r.ts.slice(0, 16).replace("T", " ")}  ${(r.tier + " " + r.resolution).padEnd(16)} ${String(r.duration).padEnd(5)} $${(r.costUsd ?? 0).toFixed(3).padStart(6)}  ${path.basename(r.out)}`,
    );
  });
  console.log(`\n    ${rows.length} clips · total ≈ $${total.toFixed(2)}\n`);
}

async function main() {
  if (flag("summary")) {
    printSummary();
    return;
  }

  const image = arg("image");
  if (!image) {
    console.error("Missing --image <path>");
    process.exit(1);
  }
  let prompt = arg("prompt");
  const pf = arg("prompt-file");
  if (pf) prompt = fs.readFileSync(pf, "utf8").trim();
  if (!prompt) {
    console.error("Missing --prompt or --prompt-file");
    process.exit(1);
  }

  const tier = (arg("tier") as FalTier) ?? "fast";
  const resolution = arg("res") ?? "720p";
  if (tier === "fast" && resolution === "1080p") {
    console.error("fast tier supports only 480p/720p; use --tier standard for 1080p");
    process.exit(1);
  }
  const durRaw = arg("dur") ?? "5";
  const duration: number | "auto" = durRaw === "auto" ? "auto" : Number(durRaw);
  const aspect = arg("aspect") ?? "auto";
  const audio = flag("audio");
  const endImage = arg("end-image");

  const est = typeof duration === "number" ? estimateCost(tier, resolution, duration) : null;
  console.log(`→ fal Seedance 2.0 [${tier}] ${resolution} ${aspect} ${duration}s${audio ? " +audio" : ""}`);
  console.log(`→ est. cost ≈ ${est != null ? "$" + est.toFixed(3) : "unknown (auto duration)"} — generating…`);

  const r = await generateVideo({
    tier,
    imagePath: image,
    endImagePath: endImage,
    prompt,
    resolution,
    duration,
    aspectRatio: aspect,
    generateAudio: audio,
    onStatus: (s) => console.log(`   · ${s}`),
  });

  const base = path.basename(image).replace(/\.[^.]+$/, "");
  const out = arg("out") ?? `assets/video-out/${base}-${tier}-${resolution}-${Date.now()}.mp4`;
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, r.data);

  const entry = {
    ts: new Date().toISOString(),
    tier: r.tier,
    resolution: r.resolution,
    duration: r.duration,
    aspect,
    costUsd: r.costUsd,
    image,
    out,
    seed: r.seed,
    prompt: prompt.slice(0, 200),
  };
  fs.appendFileSync(LEDGER, JSON.stringify(entry) + "\n");

  console.log(`✅ saved ${out} (${(r.data.length / 1e6).toFixed(1)} MB) · seed ${r.seed}`);
  console.log(`   cost ≈ ${r.costUsd != null ? "$" + r.costUsd.toFixed(3) : "unknown"}`);
  const rows = readLedger();
  const total = rows.reduce((s, x) => s + (x.costUsd ?? 0), 0);
  console.log(`   ── ledger: ${rows.length} clips · total ≈ $${total.toFixed(2)}  (npm run gen:video -- --summary)`);
}

main().catch((err) => {
  console.error("❌", err.message ?? err);
  process.exit(1);
});
