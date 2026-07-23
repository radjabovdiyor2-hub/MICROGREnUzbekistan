# FRESH WEEKLY × «JASMIN» (Самарканд) — промпты для генерации фото

Реальный ресторан: **«JASMIN» oilaviy restoran**, Самарканд, ул. Амира Темура 202.
Instagram [@jasminsamarkand](https://www.instagram.com/jasminsamarkand/) · Telegram‑доставка `t.me/jasmindostavka_bot`.
Кухня: традиционные узбекские блюда (плов, кебаб, лагман, манты, самса). Семейный, домашний уют, детская зона, летняя терраса.

Нужно **3 фото** под слоты движка: обложка + герой «Ресторан недели» + герой «Рецепт».
Фирменные цвета (из логотипа): **тёмно‑зелёный `#0F3D2E` + золото/крем `#C9A876`**, айвори `#F7F3E8`. Мотивы: белый цветок жасмина, восточная гребенчатая арка, сюзане/икат‑орнамент, съедобные цветы (виола) + микрозелень в подаче.

---

## 🎛 Общий стиль (добавляй в каждый промпт)
```
Premium editorial food & restaurant photography for a print magazine.
Brand: family restaurant "Jasmin", Samarkand, Uzbekistan — traditional Uzbek cuisine, cozy home warmth.
Palette: deep forest green #0F3D2E, warm gold/cream #C9A876, ivory #F7F3E8.
Recurring motifs: white jasmine blossom, oriental Samarkand ornaments, colorful suzani/ikat textile, edible viola flowers + fresh microgreens on the plate.
Look: photorealistic, warm natural soft light, shallow depth of field, elegant, appetizing.
Hard rules: no text, no letters, no logos, no watermark, no visible human faces.
```

---

## 1️⃣ Обложка — файл `cover.jpg`
**Формат: вертикаль 2:3 (портрет), ≥ 1240 × 1748 px.** Верхние 20% и нижние 30% держать тёмными/спокойными — туда ляжет белый заголовок.
```
Vertical magazine cover, 2:3. Evening ambience of an upscale Uzbek family restaurant
"Jasmin" in Samarkand: a warmly backlit oriental cusped arch (traditional Samarkand
archway) glowing in deep green and gold, ornamental tilework bokeh, a delicate branch
of white jasmine blossoms in the foreground with a few fresh microgreens. Deep forest
green tones, gold highlights, candle-lit, cinematic, moody, luxurious yet homely.
Keep the TOP and BOTTOM darker and calm (negative space) for white title text.
--ar 2:3
Negative: bright flat lighting, text, letters, watermark, logo, people faces, cluttered center-bottom, cartoon, plastic.
```

## 2️⃣ Ресторан недели — файл `restaurant.jpg`
**Формат: горизонталь 16:9, ≥ 1240 × 700 px.** Баннер-герой, аппетитная узбекская подача.
```
Wide horizontal food photo, 16:9. A signature Uzbek dish at family restaurant "Jasmin":
fragrant Samarkand plov (or grilled kebab with rice) on a gold-rimmed ivory plate,
served on a colorful traditional suzani/ikat tablecloth. A small brass/gold table bell
and polished cutlery beside it, a sprig of fresh microgreens and an edible viola flower
as garnish. Warm cozy family-restaurant atmosphere, soft window light, gentle bokeh of
green and gold behind. Appetizing, premium editorial styling.
--ar 16:9
Negative: people, hands, faces, text, letters, logo, watermark, harsh flash, messy table, plastic, cold blue tones.
```

## 3️⃣ Рецепт недели — файл `recipe.jpg` (Самаркандский салат с микрозеленью)
**Формат: горизонталь 16:9, ≥ 1240 × 700 px.** Светлый, свежий.
```
Wide horizontal fresh-food photo, 16:9. A vibrant Samarkand-style salad: crisp lettuce,
radish, cherry tomatoes, generous fresh pea and radish microgreens, dressed with
pomegranate narsharab and olive oil, topped with edible viola flowers. Served on a
white gold-rimmed plate over a light ivory surface with a subtle suzani ornament and
soft green-and-gold accents, a gold fork beside. Bright airy daylight, healthy, delicate,
premium editorial food styling.
--ar 16:9
Negative: people, text, letters, logo, watermark, dark muddy tones, artificial neon colors, clutter, plastic.
```

---

## 🔧 Как подставить готовые фото в журнал
1. Сохрани 3 файла в `content/generated/img/` (`cover.jpg`, `restaurant.jpg`, `recipe.jpg`).
2. В источнике выпуска (`scratchpad/render-jasmin.jsx`) замени 3 SVG‑значения на пути/URL фото:
   - `cover` → поле `background`
   - `restaurantOfWeek` → поле `heroImage`
   - `recipe` → поле `heroImage`
   (для офлайн‑файла лучше вшить как data‑URI — просто скажи «фото готовы, подставь», и я пересоберу `jasmin-w1.html` с настоящими снимками).
3. Пересобрать → `jasmin-w1.html` откроется уже с реальными фото.

> Соотношения сторон подобраны под реальные слоты: обложка — на всю страницу A5 (портрет), герои «Ресторан»/«Рецепт» — баннеры высотой ~82 мм на всю ширину.
