"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/inbox";
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) router.push(next);
    else setError(true);
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-xs space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
    >
      <div>
        <h1 className="text-lg font-semibold">Sepia Inbox</h1>
        <p className="text-sm text-[var(--color-muted)]">Войдите, чтобы продолжить</p>
      </div>
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Пароль"
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      />
      {error && <p className="text-sm text-[var(--color-danger)]">Неверный пароль</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Вхожу…" : "Войти"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
