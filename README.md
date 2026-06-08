# Sepia IG Automation

Автоматизация Instagram для бренда Sepia Software, разделённая на две части:

- **Vercel (всегда онлайн)** — приём входящих DM через Messaging webhook, ответы
  генерирует Claude в тоне бренда. Здесь же живёт долгоживущий IG-токен и его
  авто-рефреш (Vercel = единственный источник истины по токену).
- **Локалка (по запросу)** — публикация постов/Reels полуручным скриптом с
  превью и подтверждением. Токен тянется с Vercel, медиа заливается на публичный
  CDN (Sanity). Позже скрипт можно обернуть в локальный cron.

```
Meta App (Development Mode, твой аккаунт)
   ├─ Messaging webhook ─► Vercel /api/webhook ─► Claude ─► ответ в DM
   └─ Graph API ◄──────── локальный publish.ts (медиа → Sanity CDN)
                                      ▲
                          токен ◄─ Vercel /api/token
```

## Порядок запуска

### 1. Meta
Пройди **[SETUP-META.md](./SETUP-META.md)** — приложение, Professional-аккаунт,
permissions, долгоживущий токен, IG User ID. Подписку вебхука сделаешь после
деплоя (нужен публичный URL).

### 2. Зависимости
```bash
npm install
```

### 3. Инфраструктура на Vercel
1. Импортируй папку как проект на Vercel.
2. Добавь **Upstash Redis** (Vercel → Storage / Marketplace) — переменные
   `UPSTASH_REDIS_REST_*` подтянутся автоматически.
3. Задай env vars из `.env.example` (раздел Meta + Claude + `LOCAL_TOKEN_SECRET`).
   `CRON_SECRET` Vercel создаёт сам при включении cron.
4. Deploy. Получишь домен `https://<app>.vercel.app`.

### 4. Подписать вебхук
Вернись в Meta → Instagram → Webhooks:
- Callback URL: `https://<app>.vercel.app/api/webhook`
- Verify token: значение `IG_WEBHOOK_VERIFY_TOKEN`
- Подпишись на поле **messages**.

Проверка: напиши своему аккаунту в Instagram с другого профиля — должен прийти
ответ от Claude.

### 5. Локальная публикация
Создай `.env.local` (скопируй из `.env.example`) и заполни как минимум
`VERCEL_BASE_URL`, `LOCAL_TOKEN_SECRET`, и `SANITY_*` (если публикуешь файлы с
диска, а не готовые ссылки).

```bash
npm run token:check                  # проверить, что токен тянется с Vercel
npm run publish:ig -- --image ./post.jpg --caption "Текст поста"
npm run publish:ig -- --reel ./reel.mp4 --caption "..."
```

По умолчанию скрипт показывает превью и спрашивает подтверждение (визуальный
контроль). Флаг `--yes` пропускает вопрос — пригодится, когда позже повесишь
скрипт на локальный cron.

## Структура

```
app/api/webhook/            входящие DM → Claude → ответ
app/api/token/              отдаёт токен локалке (Bearer LOCAL_TOKEN_SECRET)
app/api/cron/refresh-token/ авто-рефреш токена (Vercel Cron, см. vercel.json)
lib/ig.ts                   Graph API: refresh, sendMessage, publish*
lib/claude.ts               генерация ответа в голосе бренда
lib/store.ts                Upstash: токен, дедуп вебхуков
scripts/publish.ts          локальная публикация с превью
scripts/token-check.ts      проверка связки токена
SETUP-META.md               настройка на стороне Meta
```

## Лимиты Meta (важно)
- 25 публикаций / 24 ч (Reels и Stories в тот же лимит).
- 200 авто-DM / час.
- Ответы — только в 24-часовом окне после сообщения пользователя.
