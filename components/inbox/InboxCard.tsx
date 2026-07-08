"use client";

import { useState } from "react";
import { Sparkles, Send, EyeOff, X, MessageCircle, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { sendReply, sendPrivateReply, hideItem, skipItem } from "@/app/(dashboard)/inbox/actions";
import type { InboxItemView } from "./types";

const CATEGORY_TONE: Record<string, "accent" | "success" | "danger" | "warn" | "neutral"> = {
  question_or_lead: "accent",
  praise: "success",
  spam: "warn",
  toxic: "warn",
  prohibited: "danger",
  offtopic: "neutral",
};

export function InboxCard({
  item,
  model,
  onDone,
}: {
  item: InboxItemView;
  model: string;
  onDone: () => void;
}) {
  const { event, conversation, replies } = item;
  const isComment = conversation.kind === "comment";
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    setText("");
    try {
      const res = await fetch("/api/inbox/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, modelId: model }),
      });
      if (!res.ok || !res.body) throw new Error("Не удалось сгенерировать");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setText((t) => t + decoder.decode(value, { stream: true }));
      }
    } catch (e: any) {
      setError(e?.message ?? "Ошибка генерации");
    } finally {
      setGenerating(false);
    }
  }

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (r.ok) onDone();
    else setError(r.error ?? "Ошибка");
  }

  // For comments the author is always the event's author — the conversation is
  // keyed by media, so its participant is meaningless (last commenter, often us).
  const who = isComment
    ? (event.author ?? "неизвестный")
    : (conversation.participantUsername ?? event.author ?? "неизвестный");

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-2 flex items-center gap-2 text-sm">
        {isComment ? (
          <MessageCircle className="h-4 w-4 text-[var(--color-muted)]" />
        ) : (
          <AtSign className="h-4 w-4 text-[var(--color-muted)]" />
        )}
        <span className="font-medium">{who}</span>
        <Badge tone={isComment ? "neutral" : "accent"}>{isComment ? "комментарий" : "DM"}</Badge>
        {event.category && (
          <Badge tone={CATEGORY_TONE[event.category] ?? "neutral"}>{event.category}</Badge>
        )}
        {event.escalation && event.escalation !== "none" && (
          <Badge tone="danger">{event.escalation}</Badge>
        )}
        {conversation.permalink && (
          <a
            href={conversation.permalink}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-xs text-[var(--color-muted)] underline hover:text-[var(--color-fg)]"
          >
            пост ↗
          </a>
        )}
      </div>

      <p className="mb-3 whitespace-pre-wrap text-[var(--color-fg)]">{event.text}</p>
      {isComment && conversation.mediaCaption && (
        <p className="mb-3 line-clamp-2 text-xs text-[var(--color-muted)]">
          под постом: {conversation.mediaCaption}
        </p>
      )}

      {replies.length > 0 && (
        <div className="mb-3 space-y-1.5 border-l-2 border-[var(--color-border)] pl-3">
          {replies.map((r) => {
            const mine = r.direction === "out";
            return (
              <p key={r.id} className="whitespace-pre-wrap text-sm">
                <span
                  className={cn(
                    "font-medium",
                    mine ? "text-[var(--color-accent)]" : "text-[var(--color-fg)]",
                  )}
                >
                  {mine ? "Я" : (r.author ?? "?")}:
                </span>{" "}
                <span className="text-[var(--color-muted)]">{r.text}</span>
              </p>
            );
          })}
        </div>
      )}

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ответ… (напишите вручную или нажмите «Сгенерировать»)"
        className={cn(generating && "opacity-80")}
      />

      {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={generate} disabled={generating || busy}>
          <Sparkles className="h-4 w-4" />
          {generating ? "Генерирую…" : "Сгенерировать"}
        </Button>
        <Button
          size="sm"
          onClick={() => act(() => sendReply(event.id, text, model))}
          disabled={busy || !text.trim()}
        >
          <Send className="h-4 w-4" />
          {isComment ? "Ответить публично" : "Отправить"}
        </Button>
        {isComment && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => act(() => sendPrivateReply(event.id, text))}
            disabled={busy || !text.trim()}
            title="Отправить тот же текст автору в личку"
          >
            В личку
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          {isComment && (
            <Button variant="ghost" size="sm" onClick={() => act(() => hideItem(event.id))} disabled={busy}>
              <EyeOff className="h-4 w-4" />
              Скрыть
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => act(() => skipItem(event.id))} disabled={busy}>
            <X className="h-4 w-4" />
            Пропустить
          </Button>
        </div>
      </div>
    </div>
  );
}
