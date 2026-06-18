# Видео-промпты — тест анимации каракатицы (Simon's Cat style)

Для **Dreamina → AI Video → Seedance 2.0 → Image-to-Video**.
Кадры-референсы: `assets/mascot-toon/`. Цель теста — проверить, держит ли модель плоскую
чёрную линию на белом фоне (главный риск — диффузия добавляет цвет/тени/3D/«камеру»).

## Настройки (для всех тестов)
- Режим: **Image to Video** (загрузить кадр как первый/опорный).
- Длительность: **5 сек** (коротко = меньше «уплывания» линии).
- Разрешение: 720p (для теста хватит; на 300 free-кредитах).
- Если есть ползунок Motion / amplitude — держать **low–medium**.
- Если есть поле Negative prompt — вставить блок NEGATIVE ниже.

NEGATIVE (общий, если поддерживается):
`color, colour, shading, gradient, grey fill, 3D render, realistic, photoreal, texture, paper texture, background scenery, room, camera zoom, camera pan, parallax, morphing, melting lines, extra tentacles, distorted face`

---

## Тест 1 — `02-laptop.jpg` (печатает)
> A simple 2D hand-drawn black-ink line cartoon in the style of a Simon's Cat newspaper comic, on a pure plain white background, stays perfectly FLAT and 2D the entire time — no colour, no shading, no 3D, no camera movement, the line art and white background never change style. The little cuttlefish character types busily on its laptop: its front tentacles tap up and down on the keyboard, its big round eyes blink, its body bobs slightly with each tap, and a few tiny motion lines flick near the keys. Gentle, charming, looping motion.

## Тест 2 — `03-shock.jpg` (шок у экрана)
> A simple 2D hand-drawn black-ink line cartoon in the style of a Simon's Cat newspaper comic, on a pure plain white background, stays perfectly FLAT and 2D the entire time — no colour, no shading, no 3D, no camera movement, the line art and white background never change style. The little cuttlefish reacts to its laptop screen with a comic jolt of shock: it recoils slightly backward, its big eyes pop even wider, its tentacles fly upward, and the exclamation mark above its head pops and bounces for emphasis. Snappy cartoon timing, then a brief freeze.

## Тест 3 (бонус) — `05-happy.jpg` (радость)
> A simple 2D hand-drawn black-ink line cartoon in the style of a Simon's Cat newspaper comic, on a pure plain white background, stays perfectly FLAT and 2D the entire time — no colour, no shading, no 3D, no camera movement, the line art and white background never change style. The little cuttlefish jumps for joy: it hops up and down, tentacles waving in celebration, eyes happily squished into curved arcs, mouth open in a cheer, the sparkle marks twinkle and the small motion lines pulse. Bouncy, joyful, looping.

---

## Как читать результат
- ✅ хорошо: линия и белый фон не меняются, движение плавное, персонаж не «плывёт».
- ⚠️ если добавляет цвет/тени/объём → усилить NEGATIVE, сократить до 3 сек, снизить motion.
- ⚠️ если лицо/щупальца искажаются → меньше амплитуда движения, проще действие.
