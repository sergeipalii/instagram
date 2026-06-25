# Настройка Meta (делается один раз, в браузере)

Цель — получить долгоживущий токен своего IG-аккаунта и подписать вебхук на входящие сообщения.
Без App Review: всё работает в **Development Mode**, потому что аккаунт твой.

---

## 0. Предусловия

- [ ] Instagram переключён в **Professional** (Business или Creator)
      Профиль → Settings → Account type → Switch to professional.
- [ ] Есть **страница Facebook**, и IG-аккаунт к ней привязан
      (IG Settings → Business tools / Page → Connect a Facebook Page).
- [ ] Доступ к https://developers.facebook.com под тем же FB-аккаунтом.

---

## 1. Создать приложение Meta

1. https://developers.facebook.com/apps → **Create App**.
2. Use case: выбери **Other** → тип **Business**.
3. Название, например `sepia-ig-automation`. Создать.
4. Запиши **App ID** и **App Secret** (Settings → Basic → App Secret → Show).

## 2. Подключить продукт Instagram

1. В дашборде приложения → **Add Product** → **Instagram** → Set up.
2. Открой раздел **Instagram → API setup with Instagram login** (или
   «Instagram Graph API» в зависимости от интерфейса).
3. В **Business login settings** добавь OAuth redirect URI (для генерации токена):
   `https://<твой-vercel-домен>/api/auth/callback`
   (домен появится после деплоя; пока можно поставить временно
   `https://localhost/` и обновить позже).

## 3. Разрешения (permissions)

В разделе **App review → Permissions and features** найди и добавь
(в Development Mode они доступны сразу, без ревью, для твоего аккаунта):

- [ ] `instagram_business_basic`
- [ ] `instagram_business_content_publish`  ← публикация постов
- [ ] `instagram_business_manage_messages`  ← ответы в DM

## 4. Получить долгоживущий токен

Самый простой путь без кода — через **Graph API Explorer**:

1. https://developers.facebook.com/tools/explorer
2. Сверху выбери своё приложение `sepia-ig-automation`.
3. **Generate Access Token** → залогинься, выдай все три permission выше.
4. Получишь **short-lived токен** (живёт ~1 час). Обменяй его на долгоживущий
   (~60 дней) — выполни в терминале (подставь значения):

   ```bash
   curl -s "https://graph.instagram.com/access_token\
   ?grant_type=ig_exchange_token\
   &client_secret=<APP_SECRET>\
   &access_token=<SHORT_LIVED_TOKEN>"
   ```

   В ответе будет `access_token` — это **долгоживущий токен**. Запиши.

5. Узнай свой **IG User ID**:

   ```bash
   curl -s "https://graph.instagram.com/v21.0/me?fields=user_id,username&access_token=<LONG_LIVED_TOKEN>"
   ```

   Запиши `user_id`.

> Эти два значения (LONG_LIVED_TOKEN, IG User ID) положим в Vercel.
> Дальше Vercel будет сам рефрешить токен по крону — руками больше не трогаем.

## 5. Подписать вебхук на сообщения

> Делается **после** первого деплоя на Vercel (нужен публичный URL).

1. В приложении → **Instagram → Webhooks** (или Products → Webhooks → Instagram).
2. **Callback URL:** `https://<твой-vercel-домен>/api/webhook`
3. **Verify token:** придумай строку, ту же положишь в `IG_WEBHOOK_VERIFY_TOKEN`
   на Vercel (например, длинный рандом).
4. Нажми **Verify and Save** — Meta дёрнет GET на эндпоинт, он ответит challenge.
5. Подпишись на поле **`messages`** (Subscribe).

---

## Что в итоге уходит в Vercel (env vars)

| Переменная | Откуда |
|---|---|
| `IG_APP_ID` | шаг 1 |
| `IG_APP_SECRET` | шаг 1 |
| `IG_USER_ID` | шаг 4.5 |
| `IG_LONG_LIVED_TOKEN` | шаг 4.4 (первичный, дальше рефрешится сам) |
| `IG_WEBHOOK_VERIFY_TOKEN` | шаг 5.3 (придумываешь сам) |

Остальные переменные (Claude, Upstash, секрет для /api/token) — в `.env.example`.
