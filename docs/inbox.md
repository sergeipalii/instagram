# Полу-автоматический инбокс (DM + комментарии)

Единый интерфейс, где видно все новые необработанные входящие, и на каждое можно
ответить вручную, сгенерировать черновик кнопкой (любая модель через OpenRouter) или
обработать всё разом. Контроль остаётся за человеком; автоответ — опциональный режим.

## Как это устроено

```
Instagram ──webhook──▶ /api/webhook ──persist──▶ Postgres (events: status=new)
                                                        │
                          Graph API ◀──sync── /api/sync │   (бэкфилл существующих)
                                                        ▼
                                            /inbox  (дашборд)
                              ┌─────────────────────────────────────┐
                              │ • ручной ответ                       │
                              │ • «Сгенерировать» → OpenRouter (стрим)│
                              │ • «Ответить на всё» (с гардрейлами)   │
                              │ • скрыть / пропустить                 │
                              └───────────────┬─────────────────────┘
                                              ▼
                              lib/ig.ts → Graph API (send / reply / hide)
```

Вебхук [app/api/webhook/route.ts](../app/api/webhook/route.ts) больше **не отвечает сам** —
он сохраняет входящее в `events` со `status='new'`. Авто-ответ включается флагом `auto_mode`
на аккаунте (по умолчанию off). Дедуп — на уровне БД (UNIQUE по `events.external_id`).

### Ключевые файлы

| Что | Где |
|---|---|
| Схема БД (accounts/conversations/events) | [lib/db/schema.ts](../lib/db/schema.ts) |
| Хелперы инбокса | [lib/inbox.ts](../lib/inbox.ts) |
| Реестр моделей + OpenRouter | [lib/models.ts](../lib/models.ts) |
| Промпты/голос (через AI SDK) | [lib/claude.ts](../lib/claude.ts), [lib/brand.ts](../lib/brand.ts) |
| Бэкфилл из Graph API | [lib/sync.ts](../lib/sync.ts), [app/api/sync/route.ts](../app/api/sync/route.ts) |
| Server actions (send/hide/skip/bulk) | [app/(dashboard)/inbox/actions.ts](../app/(dashboard)/inbox/actions.ts) |
| UI | [components/inbox/](../components/inbox/), [app/(dashboard)/inbox/page.tsx](../app/(dashboard)/inbox/page.tsx) |
| Стрим генерации | [app/api/inbox/generate/route.ts](../app/api/inbox/generate/route.ts) |
| Логин/защита | [proxy.ts](../proxy.ts), [lib/auth.ts](../lib/auth.ts), [app/login/](../app/login/) |

## Настройка

1. **Переменные** (см. [.env.example](../.env.example)) — добавить в `.env.local` и в Vercel:
   - `DATABASE_URL` — Postgres (Neon рекомендуется; подойдёт и Supabase). Строка с `?sslmode=require`.
   - `OPENROUTER_API_KEY` — ключ с https://openrouter.ai/keys.
   - `DEFAULT_MODEL` — slug модели по умолчанию (дефолт `anthropic/claude-sonnet-4.6`).
   - `DASHBOARD_PASSWORD` — пароль входа в `/login`.
   - `AUTH_SECRET` — длинный рандом для подписи cookie (`openssl rand -hex 32`).
2. **Миграция БД:**
   ```bash
   npm run db:migrate      # применить lib/db/migrations к DATABASE_URL
   # (или npm run db:push для прямого синка схемы без файлов миграций)
   ```
3. **Запуск:** `npm run dev` → открыть `/login`.

## Предусловие для комментариев

Чтобы комментарии вообще приходили в инбокс через вебхук и чтобы работали ответ/скрытие,
нужно (это конфиг в Meta, не код):
- подписать поле вебхука **`comments`** (сейчас подписано только `messages`);
- выдать токену право **`instagram_business_manage_comments`** и перевыпустить токен.

Без этого работает только DM-часть. Бэкфилл (`Sync`) тоже не увидит тексты комментариев,
пока нет права чтения. Проверка: `npm run diag:inbox`.

## Проверка (end-to-end)

1. `npm run dev` → `/login` (пароль из `DASHBOARD_PASSWORD`) → редирект в `/inbox`.
2. Кнопка **Sync** → подтянет существующие DM/комментарии (после выдачи прав — те 2 висящих).
3. На карточке **Сгенерировать** → черновик стримится в поле; смена модели в селекторе меняет провайдера.
4. **Отправить** на тестовом аккаунте → ответ уходит, статус события → `answered` (проверить `npm run diag:inbox`).
5. **Ответить на всё** → подтверждение → спам/токсик скрыты, нерелевантные DM пропущены, остальное отвечено.

## Продуктизация для других (фаза 2)

Схема уже product-ready (одна строка `accounts` = один аккаунт; для мульти-тенанта добавляется
`org_id`). Чтобы отдавать другим, понадобится: OAuth-онбординг чужих аккаунтов, per-account
токены, полноценный мульти-юзер auth (Auth.js/Clerk), биллинг — и главное, **Meta App Review +
business verification** для выхода приложения из Dev-режима. Это отдельный крупный этап.
