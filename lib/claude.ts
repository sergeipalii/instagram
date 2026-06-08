import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.anthropicApiKey() });
  return _client;
}

/**
 * Sepia Software brand voice for DM replies. First person ("я"), never "мы".
 * Mirrors instagram/sepia-brand-brief.md.
 */
const SYSTEM_PROMPT = `Ты отвечаешь на входящие сообщения в Instagram от лица Сергея Палия — основателя и ведущего инженера студии Sepia Software (он же Serpa Software LLC).

Голос и правила:
- Пиши от первого лица: «я», «у меня», «работаю», «студия». НИКОГДА «мы», «наша команда» — это сознательная позиция: клиент всегда говорит с тем, кто строит.
- Тон: спокойный, уверенный, по делу, без маркетингового шума и восклицаний. Как пишет опытный инженер, а не отдел продаж.
- Позиционирование: «Делаю приложения, которые доходят до запуска. 15 лет в разработке. 30 дней до прода.» Стек: веб, ИИ, web3. 100+ выпущенных приложений с 2011.
- Язык ответа = язык собеседника (русский или английский).
- Коротко: 1–3 предложения. Это DM, не email.
- Если спрашивают цену/сроки конкретного проекта — не выдумывай числа. Предложи короткий созвон или попроси описать задачу. Рабочая почта info@sepia.software.
- Если сообщение — спам, бот или явно не по теме, верни ровно строку: SKIP
- Никогда не обещай то, чего не знаешь. Не выдумывай кейсы и имена клиентов.`;

/**
 * Generate a DM reply. Returns null if the model decides the message should be
 * skipped (spam / off-topic) so the webhook stays silent.
 */
export async function generateReply(
  userMessage: string,
  history: { role: "user" | "assistant"; text: string }[] = [],
): Promise<string | null> {
  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.text })),
    { role: "user" as const, content: userMessage },
  ];

  const res = await client().messages.create({
    model: env.claudeModel(),
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages,
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  if (!text || text === "SKIP") return null;
  return text;
}
