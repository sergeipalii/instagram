"use client";

import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { RefreshCw, Zap, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { bulkAutoReply, type BulkResult } from "@/app/(dashboard)/inbox/actions";
import { InboxCard } from "./InboxCard";
import type { InboxItemView } from "./types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Filter = "all" | "dm" | "comment";

export function InboxClient({
  initialItems,
  models,
  defaultModel,
}: {
  initialItems: InboxItemView[];
  models: { id: string; label: string }[];
  defaultModel: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [model, setModel] = useState(defaultModel);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  const key = `/api/inbox?status=triaged${filter !== "all" ? `&kind=${filter}` : ""}`;
  const { data, mutate, isLoading } = useSWR<{ items: InboxItemView[] }>(key, fetcher, {
    fallbackData: { items: filter === "all" ? initialItems : initialItems.filter((i) => i.conversation.kind === filter) },
    refreshInterval: 8000,
  });
  const items = data?.items ?? [];

  // Refresh the view from the DB only. Pulling new messages from Instagram is
  // the poll-inbox cron's job now; this button just re-reads what's already
  // been ingested + processed.
  async function runSync() {
    setSyncing(true);
    setNotice(null);
    try {
      const r = await mutate();
      setNotice(`Обновлено: ${r?.items?.length ?? 0} в инбоксе`);
    } catch (e: any) {
      setNotice(`Ошибка обновления: ${e?.message ?? e}`);
    } finally {
      setSyncing(false);
    }
  }

  async function runBulk() {
    setBulkRunning(true);
    setBulkResult(null);
    try {
      const r = await bulkAutoReply(model);
      setBulkResult(r);
      mutate();
    } finally {
      setBulkRunning(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div>
      <header className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold">Инбокс</h1>
        <Badge tone="accent">{items.length}</Badge>
        <div className="ml-auto flex items-center gap-2">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="secondary" size="sm" onClick={runSync} disabled={syncing}>
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            Обновить
          </Button>
          <Button variant="ghost" size="icon" onClick={logout} title="Выйти">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="mb-4 flex items-center gap-2">
        {(["all", "dm", "comment"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-lg px-3 py-1 text-sm transition-colors",
              filter === f
                ? "bg-[var(--color-surface-2)] text-[var(--color-fg)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
            )}
          >
            {f === "all" ? "Все" : f === "dm" ? "DM" : "Комментарии"}
          </button>
        ))}

        <div className="ml-auto">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="success" size="sm" disabled={items.length === 0 || bulkRunning}>
                <Zap className="h-4 w-4" />
                Ответить на всё
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ответить автоматически на всё новое?</DialogTitle>
                <DialogDescription>
                  Модель ответит на {items.length} входящих ({model}). Спам/токсик-комментарии будут
                  скрыты, нерелевантные DM пропущены. Отправку нельзя отменить.
                </DialogDescription>
              </DialogHeader>
              {bulkResult ? (
                <div className="space-y-2 text-sm">
                  <p>✅ Ответлено: {bulkResult.answered}</p>
                  <p>🙈 Скрыто: {bulkResult.hidden}</p>
                  <p>⏭️ Пропущено: {bulkResult.skipped}</p>
                  {bulkResult.errors > 0 && (
                    <p className="text-[var(--color-danger)]">⚠️ Ошибок: {bulkResult.errors}</p>
                  )}
                  <DialogClose asChild>
                    <Button className="mt-2 w-full">Готово</Button>
                  </DialogClose>
                </div>
              ) : (
                <div className="flex gap-2">
                  <DialogClose asChild>
                    <Button variant="secondary" className="flex-1" disabled={bulkRunning}>
                      Отмена
                    </Button>
                  </DialogClose>
                  <Button variant="success" className="flex-1" onClick={runBulk} disabled={bulkRunning}>
                    {bulkRunning ? "Обрабатываю…" : "Да, ответить"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {notice && (
        <p className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-muted)]">
          {notice}
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] p-10 text-center text-[var(--color-muted)]">
          {isLoading ? "Загрузка…" : "Пусто. Нажмите Sync, чтобы подтянуть существующие входящие."}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <InboxCard key={item.event.id} item={item} model={model} onDone={() => mutate()} />
          ))}
        </div>
      )}
    </div>
  );
}
