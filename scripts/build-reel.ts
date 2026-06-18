/**
 * Assemble the «Вайбкодер и ИИ» Reel from the scene clips + stills.
 *   npm run build:reel
 *
 * Pipeline (all local, ffmpeg): for each segment → normalise to 1080x1920/30fps,
 * (stills get a free Ken Burns slow-zoom), overlay a brand-Inter caption with a
 * soft fade-in → concat all segments → assets/scene-vibecoder/reel.mp4.
 *
 * Edit TIMELINE below to tweak captions/order; re-run. Video clips are picked
 * from assets/video-out by keyframe-name prefix (latest generation wins).
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { renderSizedPng, h } from "@/lib/render";

const SCENE = path.resolve("assets/scene-vibecoder");
const VIDEO_OUT = path.resolve("assets/video-out");
const TMP = path.join(SCENE, "_build");
const OUT = path.join(SCENE, "reel.mp4");
const W = 1080, H = 1920, FPS = 30, DUR = 4;

interface Seg {
  src: string; // keyframe / clip base name
  kind: "video" | "still";
  caption: string;
  tag?: string;
}

const TIMELINE: Seg[] = [
  { src: "01-bliss", kind: "video", caption: "ИИ соберёт мне приложение за вечер" },
  { src: "02-serious", kind: "video", caption: "так… тут маленькая ошибка" },
  { src: "03-tense", kind: "video", caption: "почему сломалось ВСЁ?!" },
  { src: "04-steam", kind: "video", caption: "третий день чиню один баг" },
  { src: "05-sad", kind: "still", caption: "вайбкодинг — это не только весело" },
  { src: "06-hope", kind: "still", caption: "иногда нужен тот, кто доведёт до конца", tag: "sepia.software" },
];

function ff(args: string[]): void {
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
}

function latestClip(prefix: string): string {
  const files = fs
    .readdirSync(VIDEO_OUT)
    .filter((f) => f.startsWith(prefix + "-") && f.endsWith(".mp4"))
    .sort();
  if (!files.length) throw new Error(`No clip for "${prefix}" in ${VIDEO_OUT} — generate it first`);
  return path.join(VIDEO_OUT, files[files.length - 1]);
}

function captionNode(text: string, tag?: string) {
  const kids = [
    h(
      "div",
      {
        style: {
          display: "flex",
          textAlign: "center",
          fontFamily: "Inter",
          fontWeight: 800,
          fontSize: 62,
          lineHeight: 1.18,
          letterSpacing: -0.5,
          color: "#14141a",
          maxWidth: 880,
        },
      },
      text,
    ),
  ];
  if (tag) {
    kids.push(
      h(
        "div",
        {
          style: {
            display: "flex",
            marginTop: 28,
            fontFamily: "Inter",
            fontWeight: 700,
            fontSize: 40,
            letterSpacing: 1,
            color: "#6a6a73",
          },
        },
        tag,
      ),
    );
  }
  return h(
    "div",
    {
      style: {
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: 150,
      },
    },
    kids,
  );
}

async function main() {
  fs.mkdirSync(TMP, { recursive: true });
  const segFiles: string[] = [];

  for (let i = 0; i < TIMELINE.length; i++) {
    const seg = TIMELINE[i];
    const n = String(i + 1).padStart(2, "0");

    // 1. caption overlay PNG (transparent, brand Inter)
    const capPng = path.join(TMP, `cap-${n}.png`);
    fs.writeFileSync(capPng, await renderSizedPng(captionNode(seg.caption, seg.tag), W, H));

    // 2. normalise + (ken burns) + overlay caption → segment mp4
    const segMp4 = path.join(TMP, `seg-${n}.mp4`);
    const capFade = "[1:v]format=rgba,fade=t=in:st=0.15:d=0.35:alpha=1[c]";
    if (seg.kind === "video") {
      const clip = latestClip(seg.src);
      ff([
        "-i", clip,
        "-loop", "1", "-i", capPng,
        "-filter_complex",
        `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:white,fps=${FPS},trim=0:${DUR},setpts=PTS-STARTPTS[v];${capFade};[v][c]overlay=0:0[o]`,
        "-map", "[o]", "-t", String(DUR), "-an",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(FPS), segMp4,
      ]);
    } else {
      const still = path.join(SCENE, `${seg.src}.png`);
      ff([
        "-loop", "1", "-i", still,
        "-loop", "1", "-i", capPng,
        "-filter_complex",
        `[0:v]scale=${W * 2}:${H * 2},zoompan=z='min(zoom+0.0007,1.12)':d=${DUR * FPS}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':fps=${FPS}:s=${W}x${H}[v];${capFade};[v][c]overlay=0:0[o]`,
        "-map", "[o]", "-t", String(DUR), "-an",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(FPS), segMp4,
      ]);
    }
    segFiles.push(segMp4);
    console.log(`✅ segment ${n} (${seg.kind}) — ${seg.caption}`);
  }

  // 3. concat
  const listFile = path.join(TMP, "list.txt");
  fs.writeFileSync(listFile, segFiles.map((f) => `file '${f}'`).join("\n") + "\n");
  ff(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", OUT]);

  const sec = TIMELINE.length * DUR;
  console.log(`\n🎬 ${OUT} — ${TIMELINE.length} segments, ${sec}s`);
}

main().catch((e) => {
  console.error("❌", e.message ?? e);
  process.exit(1);
});
