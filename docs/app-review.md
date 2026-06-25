# Meta App Review — материалы заявки

Цель: получить **Advanced Access** на `instagram_business_manage_comments` и
`instagram_business_manage_messages`, чтобы инбокс читал и обрабатывал комментарии
и DM реальной аудитории (а не только тестеров). Контекст и причина — см.
[docs/inbox.md](inbox.md) и память проекта.

Предусловие: **Business Verification** портфеля Sepia Software (в процессе) + публикация приложения.

---

## Privacy policy / Data deletion (поля формы)
- Privacy Policy URL: `https://sepia.software/privacy` (добавить раздел про Meta Platform data — текст уже передан владельцу).
- Data Deletion URL: `https://sepia.software/privacy` (раздел про удаление + info@sepia.software).

---

## Обоснования по разрешениям (вставить в форму App Review)

### instagram_business_manage_comments
We are a first-party tool that manages engagement on our OWN Instagram Business
account (@sepia.software). We use this permission to:
1. Read comments left on our posts and show them in a single internal inbox.
2. Publicly reply to genuine questions and interest from our audience.
3. Send a private reply (DM) to a commenter who asks about our services.
4. Hide spam, scam and abusive comments to keep our comment sections clean.
Without this permission we cannot read or moderate comments via the API; we would
have to do it by hand in the Instagram app, which does not scale for timely replies.

### instagram_business_manage_messages
We use this permission to manage direct messages on our own Instagram Business
account:
1. Receive DMs via webhooks and display them in the same internal inbox.
2. Reply to people within the standard 24-hour messaging window.
3. Send private replies to commenters (paired with comment management).
This lets us respond promptly to prospective clients who contact us about our
software-development services. Without it we cannot receive or send DMs via the API.

### instagram_business_basic (если требуется)
Used to read our own account and media metadata (account id/username, media ids,
captions, permalinks) so the inbox can show which post a comment belongs to and
attribute conversations correctly.

---

## Сценарий скринкаста (Meta требует видео использования каждого права)

Приложение приватное (один пользователь, пароль), поэтому показываем полный путь
сами; при необходимости даём ревьюеру тестовый доступ (пароль от /login).

1. **Логин.** Открыть `https://inbox.sepia.software/login`, ввести пароль → инбокс.
2. **Получение комментария (manage_comments).** С другого аккаунта оставить
   комментарий под постом @sepia.software → в инбоксе нажать **Sync** → комментарий
   появляется в списке. Показать, что виден текст и автор.
3. **Публичный ответ + DM (manage_comments).** Нажать «Сгенерировать» → отредактировать
   → «Ответить публично»; затем «В личку». Показать на самом Instagram, что ответ
   опубликован и DM пришёл.
4. **Модерация (manage_comments).** На спам-комментарии нажать «Скрыть» → показать,
   что в Instagram он скрыт.
5. **DM (manage_messages).** С другого аккаунта написать в Direct @sepia.software →
   в инбоксе сообщение появляется → ответить → показать доставку в Instagram.
6. **Удаление данных.** Показать раздел privacy policy с инструкцией удаления
   (info@sepia.software).

Записать в хорошем качестве, английские субтитры/комментарии приветствуются.

---

## Чек-лист подачи
- [ ] Business Verification: Verified
- [ ] Privacy policy обновлена (раздел Meta Platform data) на sepia.software/privacy
- [ ] Скринкаст записан (покрывает оба разрешения)
- [ ] Обоснования вставлены в форму
- [ ] App published / advanced access запрошен
- [ ] После одобрения: токен в Upstash (ig:token), Sync, проверка на реальных данных
