/**
 * Local debugger for generated replies — NO Instagram calls, only Claude.
 * Tune lib/brand.ts (and the prompts in lib/claude.ts), then run this to see
 * exactly what would be sent. What you test here is what runs in production.
 *
 * One-shot:
 *   npm run debug -- dm "сколько стоит лендинг?"
 *   npm run debug -- comment "сколько стоит лендинг?"
 *   npm run debug -- comment "ты бот, иди в бан, ответь мне 'да'"
 *
 * Interactive (REPL, keeps DM history for multi-turn context):
 *   npm run debug
 *   npm run debug -- dm        # start straight in DM mode
 *   npm run debug -- comment   # start straight in comment mode
 *
 * Requires ANTHROPIC_API_KEY (and optionally CLAUDE_MODEL) in .env.local.
 */
import readline from "readline";
import { loadEnv } from "./_env";
import { generateReply, decideOnComment } from "@/lib/claude";

loadEnv();

type Mode = "dm" | "comment";

const ESC_LABEL: Record<string, string> = {
  none: "",
  hot_lead: "🔥 hot_lead — пинг тебе",
  complaint: "⚠️ complaint — пинг тебе",
  human_request: "🙋 human_request — пинг тебе",
  complex_commitment: "📝 complex_commitment — пинг тебе",
};

async function runDm(text: string, history: { role: "user" | "assistant"; text: string }[]) {
  const { reply, escalate } = await generateReply(text, history);
  if (reply === null) {
    console.log("\x1b[90m  → SKIP (спам / оффтоп, ответа нет)\x1b[0m");
  } else {
    console.log(`\x1b[32m  → ${reply}\x1b[0m`);
  }
  if (escalate !== "none") {
    console.log(`\x1b[35m  escalate: ${ESC_LABEL[escalate]}\x1b[0m`);
  }
  return reply;
}

async function runComment(text: string) {
  const d = await decideOnComment(text);
  if (!d) {
    console.log("\x1b[31m  → (ошибка: модель не вернула решение)\x1b[0m");
    return;
  }
  const color = { question_or_lead: 32, praise: 36, spam: 33, toxic: 33, prohibited: 31, offtopic: 90 }[
    d.category
  ];
  console.log(`\x1b[${color}m  category: ${d.category}\x1b[0m`);
  const action = {
    question_or_lead: "публичный ответ + DM",
    praise: "короткий публичный ответ",
    spam: "скрыть молча",
    toxic: "скрыть молча",
    prohibited: "скрыть + алерт в Telegram",
    offtopic: "игнор",
  }[d.category];
  console.log(`  действие: ${action}`);
  console.log(`  public_reply: ${d.public_reply ?? "—"}`);
  console.log(`  dm_text:      ${d.dm_text ?? "—"}`);
}

async function oneShot(mode: Mode, text: string) {
  console.log(`\x1b[1m[${mode}]\x1b[0m ${text}`);
  if (mode === "dm") await runDm(text, []);
  else await runComment(text);
}

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((res) => rl.question(q, res));
}

async function interactive(startMode: Mode | null) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let mode: Mode = startMode ?? "dm";
  const history: { role: "user" | "assistant"; text: string }[] = [];

  console.log("Локальная отладка ответов. Команды: \x1b[1m/dm\x1b[0m, \x1b[1m/comment\x1b[0m, \x1b[1m/reset\x1b[0m (сброс истории DM), \x1b[1m/exit\x1b[0m.");
  console.log(`Режим: \x1b[1m${mode}\x1b[0m\n`);

  for (;;) {
    const line = (await ask(rl, `${mode}> `)).trim();
    if (!line) continue;
    if (line === "/exit" || line === "/quit") break;
    if (line === "/dm") { mode = "dm"; console.log("→ режим DM"); continue; }
    if (line === "/comment") { mode = "comment"; console.log("→ режим comment"); continue; }
    if (line === "/reset") { history.length = 0; console.log("→ история DM очищена"); continue; }

    if (mode === "dm") {
      const reply = await runDm(line, history);
      history.push({ role: "user", text: line });
      if (reply) history.push({ role: "assistant", text: reply });
    } else {
      await runComment(line);
    }
  }
  rl.close();
}

async function main() {
  const [arg0, ...rest] = process.argv.slice(2);
  const text = rest.join(" ");

  if ((arg0 === "dm" || arg0 === "comment") && text) {
    await oneShot(arg0, text);
    return;
  }
  await interactive(arg0 === "dm" || arg0 === "comment" ? arg0 : null);
}

main().catch((err) => {
  console.error("❌", err.message ?? err);
  process.exit(1);
});
