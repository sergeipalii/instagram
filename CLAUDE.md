# Instagram automation (Sepia Software)

Автоматизация Instagram для бренда Sepia Software: инбокс (DM + комментарии)
на Vercel, публикация контента — с локальной машины. Один Meta app.

## Архитектура (не перепроверять — так и есть)

- **Vercel (always-on), прод: `inbox.sepia.software`** — webhook Meta
  (`app/api/webhook/route.ts`), `/inbox` (human-in-the-loop ответы через
  OpenRouter), `GET /api/token` (отдаёт живой IG-токен по `LOCAL_TOKEN_SECRET`),
  Telegram-алерты, крон обновления токена и дайджеста подписчиков.
- **Локально** — генерация и публикация контента (`scripts/*`), медиа нужен
  публичный URL (Meta сам скачивает).
- **БД** — Neon Postgres (Drizzle). `DATABASE_URL` в `.env.local`; миграции
  применяются локально: `npm run db:migrate` (Neon HTTP driver, порт 443 —
  работает даже где TCP 5432 закрыт).
- **Живой IG-токен лежит в Upstash (на Vercel)**, а не в `.env.local` —
  локальная копия там СТАРАЯ. Получать: `GET inbox.sepia.software/api/token`
  с `LOCAL_TOKEN_SECRET`. `scripts/publish.ts` умеет fallback на env-токен,
  только если `VERCEL_BASE_URL` не задан.

## Деплой

- **Автодеплой из GitHub ЕСТЬ**: `git push` в `main` → Vercel собирает и
  выкатывает прод сам (проверено 2026-07-07). Ручной путь
  (`npx vercel --prod --yes`) — только если нужно выкатить незакоммиченное.
- Проверка статуса: `npx vercel ls`, логи упавшей сборки:
  `npx vercel inspect <url> --logs`.
- Сборка гоняет `tsc` — перед пушем запускать `npx tsc --noEmit`.

## Вебхук и инбокс — текущее состояние отладки

- Пайплайн проверен end-to-end на синтетических подписанных событиях:
  подпись → парсинг → хендлер → Postgres → /inbox. Секрет/токен/подписка
  корректны. НЕ передиагностировать как баг конфигурации.
- **Каждое signature-valid событие пишется в БД** (с 2026-07-07): эхо/свои/
  ответы/пустые помечаются `events.ignored=true` + `ignored_reason`, инбокс
  читает только `ignored=false`. Т.е. любой Test-пинг из панели Meta обязан
  оставить строку в `events` — это главный инструмент проверки доставки.
- Блокер реальных событий (диагноз 2026-07-06): в Standard Access Meta не
  шлёт вебхуки о действиях не-тестеров → нужен Advanced Access (App Review).
  Business Verification пройдена 2026-07-01. Идёт перепроверка доставки
  (2026-07-07): тестовые события из панели Meta → строка в `events`.

## Команды

- `npm run db:migrate` — миграции в Neon (локально, из `.env.local`)
- `npm run diag:inbox` — диагностика Graph API (⚠️ читает СТАРЫЙ токен из
  `.env.local`)
- `npm run dump:texts` / `render:carousel` / `publish:carousel` — контент
- `npm run gen:voice` — озвучка ElevenLabs (`ELEVENLABS_API_KEY`)

## Прочее

- `docs/` в `.gitignore` — в репозитории только код приложения; планы и
  брифы живут вне гита (и в памяти Claude).
- Медиа-ассеты (`assets/`) трекаются в гите, включая видео.
- Долгосрочные факты и историю решений смотри в памяти Claude
  (`MEMORY.md` проекта) — не перепроверяй их с нуля.
