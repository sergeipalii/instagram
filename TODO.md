# TODO

Personal task tracker for this project. Lives in git, single source of truth for what I'm working on.
Product/plan context lives in docs/inbox.md and docs/automation-plan.md. This file is "what's next" not "what is it".

**Statuses:** `todo` · `doing` · `blocked` · `done`
**Line format:** `- [status] title — due: YYYY-MM-DD · started: YYYY-MM-DD · done: YYYY-MM-DD · note: …`
All date fields optional; fill only what's relevant.

---

## Now (active this week)

### Автоматизация выпуска Reels через ИИ-аватар HeyGen (главный фокус)
note: смена курса — вместо реальной съёмки цифровой аватар Сергея (HeyGen Digital Twin). Цель — опыт автоматизации канала продаж, сам процесс = кейс для заказчиков. Полный план: docs/avatar-reels-automation.md. Клонируем ЕГО лицо (не синтетика) ради позиционирования; про «это ИИ-аватар» коммуницировать открыто как продукт.
- [ ] blocked — Оплатить платный план HeyGen и создать боевой Digital Twin со всеми платными возможностями — due: 2026-07-08 · note: ОТЛОЖЕНО на 2–3 дня по решению владельца (2026-07-05). До оплаты набело не писать. Тариф с API (Business) если сразу строим пайплайн
- [ ] todo — Снять исходный клип на телефон по спеке (docs/avatar-reels-automation.md §5) и загрузить через Upload (не вебка) — note: сначала тестовый клон 15 сек, проверить RU-голос; если не зайдёт — Argil
- [ ] todo — Написать скрипт для исходного клипа клона (Claude, 30–40 сек живой речи на RU)
- [ ] todo — Прогнать 1 ролик через HeyGen API вручную (script → avatar mp4), затем собрать MVP-пайплайн пиллара «Новости-дайджест»: RSS → Claude → HeyGen → рендер+субтитры → IG publish — note: точки интеграции в §7, использует lib/ig.ts + scripts/publish.ts
- [ ] todo — Пиллар Q&A «спроси дева»: вопросы из инбокса → Claude драфт → аватар (замыкает петлю автоматизации, сам кейс)

### Ребрендинг профиля: «студия с маскотом» → «человек со студией»
note: разворот из docs/instagram-brand-plan-sepia.md §0. Аккаунт только стартовал — самый дешёвый момент для пивота (аудитории, которую «предаст» ребрендинг, ещё нет). Сохраняем хендл, визуал (тёмная тема/неон/Inter) и старые посты; маскот-каракатицу понижаем в сайдкики. Конкретная спека — docs/instagram-execution.md §1. Массово старое не удалять.
- [ ] doing — Аватар → фото Сергея в фирменном неоне (вариант «фото + каракатица на плече» ок) — started: 2026-07-04 · note: нужен исходник фото; бриф в execution §1
- [ ] todo — Bio от первого лица + Name-поле с ключевыми словами (вайбкодинг) + ссылки cal.com/sepia/intro + TG — note: финальный текст в execution §1, проверить ≤150 символов
- [ ] todo — Тип аккаунта: включить Creator/Business, категория «образование/технологии»
- [ ] todo — Закреп: интро-рилс «пора познакомиться» — note: ОТЛОЖЕНО, владелец не готов к посылу (2026-07-05); будет произведён через ИИ-аватар, не живой съёмкой. Бриф execution §1.4
- [ ] todo — Заархивировать 2–3 самых «безликих» студийных поста (остальное оставить как историю)
- [ ] todo — Переформулировать reels-пайплайн: маскот = сайдкик, лицо-первым (docs/reels-ideas.md сейчас mascot-first) — note: см. execution §4

### Контент — старт (Дни 1–30 из 90-дневного плана)
note: план §6 «Дни 1–30». Каденс месяца 1: 4 reels + 1 карусель/нед = 16 reels + 4 карусели. Флагман охвата — рубрика «Спасаю» (доводка ИИ-приложений). Бэклог слотов — docs/instagram-execution.md §2.
- [ ] todo — Записать 8 хуков и прогнать через Trial Reels — note: список-заготовка в execution §2; хуки с цифрами/кейсами — только по реальным фактам
- [ ] todo — Серия «Спасаю»: 4 разбора чужих ИИ-прототипов (Lovable/Bolt → что сломается на релизе)
- [ ] todo — Собрать Highlights: Менторство · Доводка · Разработка · Автоматизация · Кейсы · FAQ — note: спека и иконки в execution §3
- [ ] todo — Первый лид-магнит: «чек-лист готовности ИИ-приложения к релизу» (под DM-механику) — note: execution §5
- [ ] todo — Метрика месяца 1: удержание первых 3 сек ≥ 70%, средний watch time ≥ 50%

### App Review — доступ к комментариям/DM реальной аудитории
note: comments/DM реальных пользователей не читаются в Dev/Standard Access (видны только данные тестеров). Нужен Advanced Access через App Review. webhook-поле `comments` уже подписано, токен с manage_comments выпущен — этого недостаточно без ревью.
СТАТУС (2026-07-06): ✅ Пайплайн инбокса ПРОВЕРЕН насквозь — подписанные тест-события доходят, пишутся в БД, видны в инбоксе; `IG_APP_SECRET`, вебхук, обработчик — всё исправно. Единственный блокер — Meta не доставляет РЕАЛЬНЫЕ события в dev-режиме (в логах 0 реальных доставок). Значит остаётся только App Review. Диагноз финальный, не пере-разбирать как баг конфига — детали в памяти [inbox delivery blocked on App Review].
СТАТУС (2026-07-01): ✅ Business Verification VERIFIED. ДАЛЕЕ → записать скринкаст по сценарию docs/app-review.md → подать App Review (manage_comments + manage_messages) → publish app → обновить токен в Upstash → Sync → проверка. Privacy policy на sepia.software/privacy уже дополнена разделом Meta Platform data.
- [ ] todo — Задеплоить наблюдаемость вебхука: webhook пишет ВСЕ подписанные события с `ignored`+причина, инбокс фильтрует `ignored=false` (код готов, миграция 0001 УЖЕ применена к прод-БД, НЕ задеплоено) — note: блокер деплоя — чужой тип-эрор `lib/ig.ts` `share_to_feed: true`→`"true"`; затем `npx vercel --prod`
- [x] done — Business Verification: SERPA PROGRAMMNOE OBESPECHENIE OSOO — VERIFIED — done: 2026-07-01 · note: DUNS-матч + identity verification (личный документ). 1-я попытка отклонена «photo ID expired» (нечитаемая дата на скане), переподана 2026-06-29 с чёткими датами → одобрено.
- [ ] doing — Записать скринкаст App Review (оба разрешения) — started: 2026-07-01 · note: сценарий в docs/app-review.md §«Сценарий скринкаста»; нужен тестер-аккаунт для демо комментария/DM
- [ ] todo — Подать App Review на `instagram_business_manage_comments` + `instagram_business_manage_messages` (advanced access), вставить обоснования из docs/app-review.md, затем Publish приложения
- [ ] todo — После одобрения: обновить токен на Vercel (Upstash ig:token), прогнать Sync, проверить инбокс на реальных комментариях/DM

---

## Next (queued — weeks/month out)

### Контент — Дни 31–60 (удвоение работающего + коллабы)
note: план §6 «Дни 31–60». Каденс: 5–7 reels + 1–2 карусели/нед. Цель: 1000+ подписчиков, первые 5–10 заявок на созвон.
- [ ] todo — Анализ: топ-3 рубрики по DM-шерам и сохранениям → 60% контента туда
- [ ] todo — 2 collab-поста с RU-креаторами (автоматизация / no-code / маркетинг, 15–100K, не прямые конкуренты)
- [ ] todo — Механика «напиши слово» под лид-магнит (один раз, замерить DM-конверсию)
- [ ] todo — Запустить ежедневные Stories (процесс, опросы, скринкасты) — после ~300–500 подписчиков
- [ ] todo — Серийный формат «собираю приложение с не-разработчиком» — 1 серия/нед (сериальность = возвраты)

### Инбокс / автоматизация
- [ ] todo — Тумблер `auto_mode` прямо в UI инбокса (сейчас только в БД на accounts)
- [ ] todo — Сделать inbox.sepia.software основным доменом прод (редирект vercel.app → inbox)

---

## Backlog (no date, ideas and debt)

### Контент — Дни 61–90 (монетизация и сериальность)
note: план §6 «Дни 61–90». Цель: 2500–4000 подписчиков, 3–5 продаж менторства, 1–2 контракта на доводку/разработку.
- [ ] todo — Запуск «Первого набора» менторства (5 мест дешевле за публичный кейс) с контент-обвязкой: анонс → отбор → старт → еженедельные апдейты учеников — note: не раньше ~500–1000 подписчиков
- [ ] todo — Пакет кейсов доводки в Highlights
- [ ] todo — Остальные лид-магниты: «5 промптов для Claude Code», «карта инструментов вайбкодинга 2026» — execution §5
- [ ] todo — Решить про публикацию цены разовой консультации в шапке (модель manohin $120/час как якорь) — после первых 20 созвонов
- [ ] todo — Синергия с Telegram-каналом: кросс-CTA (reels↔TG), единые лид-магниты — план §10

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
