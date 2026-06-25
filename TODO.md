# TODO

Personal task tracker for this project. Lives in git, single source of truth for what I'm working on.
Product/plan context lives in docs/inbox.md and docs/automation-plan.md. This file is "what's next" not "what is it".

**Statuses:** `todo` · `doing` · `blocked` · `done`
**Line format:** `- [status] title — due: YYYY-MM-DD · started: YYYY-MM-DD · done: YYYY-MM-DD · note: …`
All date fields optional; fill only what's relevant.

---

## Now (active this week)

### App Review — доступ к комментариям/DM реальной аудитории (главный блок)
note: comments/DM реальных пользователей не читаются в Dev/Standard Access (видны только данные тестеров). Нужен Advanced Access через App Review. webhook-поле `comments` уже подписано, токен с manage_comments выпущен — этого недостаточно без ревью.
- [ ] todo — Создать выделенный Business Portfolio «Sepia Software» (из текущего аккаунта; business email admin@sepia.software) — НЕ авто-портфель 26769128656057058
- [ ] todo — Привязать к портфелю активы: app `sepia-automation`, IG `@sepia.software`, домен `sepia.software` (+ verify домена)
- [ ] blocked — Business Verification: SERPA PROGRAMMNOE OBESPECHENIE OSOO — started: 2026-06-25 · note: подана (нашли по DUNS), identity verification (личный документ, т.к. телефон из реестра недоступен). In review ~2 раб. дня
- [ ] todo — Подготовить материалы App Review: privacy policy URL на sepia.software, скринкаст-демо использования каждого разрешения, тексты обоснований
- [ ] todo — Подать App Review на `instagram_business_manage_comments` + `instagram_business_manage_messages` (advanced access), затем Publish приложения
- [ ] todo — После одобрения: обновить токен на Vercel (Upstash ig:token), прогнать Sync, проверить инбокс на реальных комментариях/DM

---

## Next (queued — weeks/month out)

- [ ] todo — Тумблер `auto_mode` прямо в UI инбокса (сейчас только в БД на accounts)
- [ ] todo — Сделать inbox.sepia.software основным доменом прод (редирект vercel.app → inbox)

---

## Backlog (no date, ideas and debt)

### Продукт — инбокс / автоматизация
- [ ] todo — Реалтайм-обновление инбокса вместо поллинга (SSE / Supabase Realtime) — docs/inbox.md
- [ ] todo — Карусели и Stories через Graph API (сейчас только фото + Reel) — docs/automation-plan.md
- [ ] todo — Генерация визуалов: шаблоны слайдов (M1) + Gemini-фоны + Veo-видео — docs/automation-plan.md §4
- [ ] todo — Генерация текстов постов (Claude, M2): plan.json + generatePost() — docs/automation-plan.md §4
- [ ] todo — Очередь черновиков + аппрув через Telegram inline-кнопки (M4) — docs/automation-plan.md §4
- [ ] todo — Планировщик публикаций по слотам (Vercel Cron, M5) — docs/automation-plan.md §4
- [ ] todo — Мультиязычность RU→EN→ES: отдельный аккаунт на язык, lang-измерение — docs/automation-plan.md §3.5

### Продукт — фаза 2 (продуктизация для других)
- [ ] todo — Мульти-тенант: org_id во всех таблицах — docs/inbox.md фаза 2
- [ ] todo — Instagram OAuth-онбординг чужих аккаунтов + per-account токены (ig:token:{account})
- [ ] todo — Полноценный мульти-юзер auth (Auth.js/Clerk) вместо одного пароля
- [ ] todo — Биллинг
- [ ] blocked — Meta App Review + business verification (выход из Dev-режима) — note: гейт для всех чужих аккаунтов

### Тех-долг
- [ ] todo — Покрыть тестами критичный путь инбокса (webhook persist, bulk auto-reply гардрейлы)
- [ ] todo — Привести в порядок старые publish-скрипты (scripts/publish*.ts, render-carousel и т.п.) под текущую архитектуру

---

## Blocked (waiting on external event)

- [ ] blocked — Проверка комментариев/DM end-to-end на реальной аудитории — note: ждёт одобрения App Review (advanced access). См. блок «App Review» в Now

---

## Done (last ~10; prune older periodically)

- [x] done — Навести порядок в корне: docs → docs/, хелперы → scripts/, обновлён README (структура) — done: 2026-06-25
- [x] done — Логин: кнопка «показать пароль» (Eye/EyeOff) на /login — done: 2026-06-25
- [x] done — Semi-automatic inbox: DM + comment queue, AI-assisted replies, Neon/Drizzle, OpenRouter, auth, deploy — done: 2026-06-25 · commit: a66f072
- [x] done — inbox.sepia.software: custom domain + TLS (убрать Safe Browsing flag) — done: 2026-06-25 · note: A inbox→76.76.21.21, cert выпущен
- [x] done — Daily follower-count digest to Telegram (Vercel cron) — done: 2026-06-18 · commit: 5b238b7
- [x] done — Escalate to owner (Telegram) on leads/complaints/human-requests/commitments — done: 2026-06-09 · commit: 397504d
- [x] done — Local debug CLI + extract brand context to lib/brand.ts — done: 2026-06-09 · commit: 3fb2ff1
- [x] done — Switch prohibited-comment alerts from Resend email to Telegram bot — done: 2026-06-09 · commit: d43acb4
- [x] done — Comment handling: classify, public reply + DM, moderation hide + alert — done: 2026-06-09 · commit: ed5a1b8
- [x] done — Accept KV_REST_API_* env names from Vercel's Upstash integration — done: 2026-06-08 · commit: 7a4f87b
- [x] done — Initial commit: Instagram automation (Vercel DMs + local publisher) — done: 2026-06-08 · commit: 9c69fa3

---

## Usage

- Starting a task: move from `Next` to `Now`, set status `doing`, add `started:`.
- Finishing: set `done`, add `done:` and short commit sha, move to `Done`.
- Weekly: prune `Done` to ~10 entries; demote stuck items in `Now` back to `Next` with a `note:` of why.
- If a task sits >3 days without progress, add a `note:` explaining the blocker.
- File history: `git log TODO.md`.
