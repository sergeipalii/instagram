/**
 * Generate a voice-over clip with ElevenLabs text-to-speech.
 *
 *   npm run gen:voice -- --voice rSfuQoQ3FY8SVKeraMAp --text "Привет!" --out vo.mp3
 *   npm run gen:voice -- --voice <id> --text-file line.txt --model eleven_v3 --out vo.mp3
 *
 * Flags:
 *   --voice <id>          ElevenLabs voice id (required)
 *   --text "<text>"       text to speak (or use --text-file)
 *   --text-file <path>    read the text from a file
 *   --model <id>          override ELEVENLABS_MODEL (default eleven_v3)
 *   --out <path>          output mp3 (default ./vo.mp3)
 *   --stability <0..1>    voice_settings.stability (default 0.4)
 *   --similarity <0..1>   voice_settings.similarity_boost (default 0.75)
 *   --style <0..1>        voice_settings.style (default 0)
 *   --format <fmt>        output_format (default mp3_44100_128)
 */
import fs from "fs";
import path from "path";
import { loadEnv } from "./_env";
import { env } from "@/lib/env";

loadEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const voice = arg("voice");
  if (!voice) {
    console.error("Missing --voice <id>");
    process.exit(1);
  }
  let text = arg("text");
  const tf = arg("text-file");
  if (tf) text = fs.readFileSync(tf, "utf8").trim();
  if (!text) {
    console.error('Missing --text "<text>" or --text-file <path>');
    process.exit(1);
  }

  const model = arg("model") ?? env.elevenLabsModel();
  const out = arg("out") ?? "vo.mp3";
  const format = arg("format") ?? "mp3_44100_128";
  const stability = Number(arg("stability") ?? "0.4");
  const similarity = Number(arg("similarity") ?? "0.75");
  const style = Number(arg("style") ?? "0");

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=${format}`;
  console.log(`→ ElevenLabs ${model} · voice ${voice} · ${format}`);
  console.log(`→ "${text}"`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": env.elevenLabsKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability, similarity_boost: similarity, style },
    }),
  });

  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`ElevenLabs failed (${res.status}): ${errTxt.slice(0, 600)}`);
  }

  const data = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, data);
  console.log(`✅ saved ${out} (${(data.length / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error("❌", err.message ?? err);
  process.exit(1);
});
