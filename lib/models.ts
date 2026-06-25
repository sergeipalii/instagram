import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { env } from "./env";

let _openrouter: ReturnType<typeof createOpenRouter> | null = null;
function openrouter() {
  if (!_openrouter) _openrouter = createOpenRouter({ apiKey: env.openrouterKey() });
  return _openrouter;
}

/**
 * Curated model menu for the UI selector. ids are OpenRouter model slugs.
 * Add/remove freely — the default comes from env (DEFAULT_MODEL).
 */
export const MODELS: { id: string; label: string }[] = [
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
  { id: "anthropic/claude-opus-4.1", label: "Claude Opus 4.1" },
  { id: "anthropic/claude-3.5-haiku", label: "Claude Haiku 3.5" },
  { id: "openai/gpt-5.1", label: "GPT-5.1" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
  { id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1" },
];

export function defaultModelId(): string {
  return env.defaultModel();
}

/** True if id is in the curated menu (guard against arbitrary input from the UI). */
export function isAllowedModel(id: string): boolean {
  return MODELS.some((m) => m.id === id) || id === defaultModelId();
}

/** Resolve a model id (or the default) to an AI SDK LanguageModel via OpenRouter. */
export function resolveModel(modelId?: string): LanguageModel {
  const id = modelId && isAllowedModel(modelId) ? modelId : defaultModelId();
  return openrouter().chat(id);
}
