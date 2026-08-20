# «Shakar va tartib» — чем заполнить полосы

Бриф на съёмку/генерацию кадров для спецвыпуска. Размеры слотов —
из [magazine-print-spec.md](magazine-print-spec.md), менять их здесь нельзя:
`object-fit: cover` подрежет кадр вслепую, если пропорция не совпадёт.

## Что сейчас на полосах

| Полоса | Материал | Кадр |
|---|---|---|
| 1 | Обложка | ⚠️ `catalog/cover-hero.png` — общая обложка каталога, не про сахар |
| 2 | Колонка редактора + содержание | — (и не нужен, см. ниже) |
| 3 | Откуда тяжесть после плова, таблица четырёх скоростей | **пусто** |
| 4 | Одна тарелка, другой порядок | ✅ `plov-jasmin.jpeg` |
| 5 | Сколько чайных ложек в день (ВОЗ) | **пусто** |
| 6 | Четыре шага, одна привычка | **пусто** |
| 7 | Вчерашний плов, резистентный крахмал | **пусто** |
| 8 | Что в упаковке | ✅ 4 кадра культур из каталога |
| 9 | Молекулы внутри листа | **пусто** |
| 10 | Почему не греем и почему важно жевать | ✅ `catalog/farm.png` |
| 11 | Рецепт | ✅ `recipe.png` |
| 12 | Задняя обложка + QR | ✅ `qr-balans.png` |

Шесть полос из двенадцати — сплошной текст, причём подряд (5, 6, 7 и 9).
Отсюда и ощущение пустоты: читатель листает четыре разворота без единой
остановки для глаза.

**Полоса 2 остаётся без кадра намеренно.** Оглавление живёт воздухом; фото
на нём конкурирует с колонкой редактора и превращает разворот в афишу.

## Приоритет

Снимать всё сразу не обязательно — порядок по отдаче:

1. **Обложка** — сейчас номер про сахар открывается картинкой из каталога.
   Один кадр меняет впечатление сильнее остальных пяти вместе взятых.
2. **Полоса 5, ложки сахара** — самый сильный образ номера: норму ВОЗ
   видно без чтения.
3. **Полоса 7, вчерашний плов** — приём, ради которого номер и написан.
4. **Полоса 9, макро листа** — разбивает самую плотную полосу.
5. **Полоса 3** и **полоса 6** — если останется время.

## Чего на кадрах быть НЕ должно

- **Никакого текста, цифр и надписей.** Генератор врёт в узбекской латинице,
  а подписи в макете свои. Всё, что нужно сказать словами, уже набрано.
- **Никаких «было → стало», весов, таблеток, глюкометров и лабораторий.**
  Номер прямо оговаривает: «всё ниже — о научных публикациях, а не о нашем
  товаре». Кадр с пробиркой превращает эту оговорку в ложь, и это уже
  медицинское обещание, а не иллюстрация.
- **Никаких чужих брендов на упаковке.** Пакет — простой прозрачный.
- **Никаких лиц крупным планом.** Руки — можно и нужно, лица требуют релиза.

## Технические требования

| Слот | Файл | Пропорция | Минимум, px (300 dpi) |
|---|---|---|---|
| Обложка | `shakar-01-cover.jpg` | 5:7 вертикаль | **1820 × 2551** |
| Полосы 3, 5, 6, 7, 9 | см. ниже | ≈2.9:1 горизонталь | **1512 × 520** |

**Как получить 2.9:1.** Большинство генераторов не умеют такую пропорцию.
Генерируйте в **16:9 (1792 × 1024)** и обрежьте по центру до 1792 × 618 —
это с запасом перекрывает минимум. В промптах ниже композиция уже
рассчитана на то, что верх и низ уйдут под нож.

**Обложка требует апскейла.** Вертикальный максимум у генераторов обычно
1024 × 1536 — это 175 dpi вместо 300 (та же ошибка, что описана в спеке).
Сгенерируйте в максимуме и прогоните через апскейл ×2.

**Куда класть.** Готовые файлы — в `content/generated/img/`. Оттуда их
разложит по местам `node scripts/publish-magazine.mjs`; руками в
`apps/web/public/magazine/shakar-01/` ничего не кладите — эта папка
собирается скриптом, и правка в ней потеряется при следующей публикации.

---

# Промпты

## 1. Обложка — `shakar-01-cover.jpg` (5:7 вертикаль)

```
Vertical editorial magazine cover photography, shot from a 35-degree angle:
on a warm neutral linen tablecloth, a small white ceramic bowl of fresh green
microgreens stands in sharp focus in the foreground; behind it, softly out of
focus, a traditional Uzbek plov in a shallow ceramic dish. Natural window
daylight from the left, soft directional shadows. Generous clean empty space
across the upper third of the frame for a masthead. Emerald green accents,
warm golden rice tones, clean white and soft neutral background. Premium,
minimal, appetizing, high-key soft lighting, shallow depth of field.
Photorealistic. No text, no letters, no numbers, no logos, no hands, no faces.
5:7 vertical composition.
```

*Идея: зелень стоит ПЕРЕД пловом — это весь номер одним кадром.*

## 2. Полоса 5, норма ВОЗ — `sugar-spoons.jpg` (16:9 → обрезать)

```
Ultra-wide horizontal still life, straight top-down flat lay on a clean white
surface: a neat single row of identical stainless steel teaspoons stretching
across the frame, each heaped with white granulated sugar. Soft natural
daylight, gentle shadows falling to one side, a few scattered sugar crystals
on the surface. Minimal, clinical yet warm editorial photography, generous
clean empty space above and below the row. Photorealistic, sharp focus edge
to edge. No text, no numbers, no labels, no packaging, no hands.
Wide panoramic composition, subject centred in a narrow horizontal band.
```

*Важно: ложки в один ряд по центру — верх и низ уйдут под обрез.*

## 3. Полоса 7, вчерашний плов — `plov-cold.jpg` (16:9 → обрезать)

```
Ultra-wide horizontal food photography: a clear glass food container of cooked
Uzbek plov with its lid resting beside it, on a cool light marble kitchen
surface, cold condensation beading on the glass, refrigerator-cool daylight.
A small bowl of fresh green microgreens sits alongside as a colour accent.
Calm, clean, domestic kitchen mood, minimal props, plenty of empty surface
around the subject. Photorealistic, shallow depth of field. No text, no
labels, no brand packaging, no hands. Wide panoramic composition, subject
centred in a narrow horizontal band.
```

*Холодный свет здесь работает на смысл: рис остывал сутки.*

## 4. Полоса 9, молекулы в листе — `leaf-macro.jpg` (16:9 → обрезать)

```
Ultra-wide horizontal extreme macro photography of fresh microgreen leaves —
broccoli sprouts and red amaranth — filling the frame, backlit by soft natural
daylight so the leaf veins glow translucent and the cell structure is visible.
Tiny water droplets on the leaf surface. Deep emerald green with red-violet
amaranth accents against a clean soft-white background. Beautiful and precise,
editorial macro, razor-sharp central detail with focus falling off to the
sides. Photorealistic. No text, no diagrams, no arrows, no laboratory
equipment, no test tubes, no gloves, no hands. Wide panoramic composition.
```

*Никакой лаборатории — полоса прямо говорит, что молекулы в НАШЕМ товаре
не измерялись. Пробирка в кадре сделала бы эту оговорку враньём.*

## 5. Полоса 3, физика стола — `plate-order.jpg` (16:9 → обрезать)

```
Ultra-wide horizontal top-down food photography: a traditional Uzbek plov in a
shallow ceramic dish on the right side of the frame, and a separate small
plate of fresh green microgreens on the left, both on a warm neutral linen
tablecloth. Clear empty space between the two plates. Natural window daylight,
soft shadows, simple local ceramic tableware, no clutter. Warm, appetizing,
calm family-table mood. Photorealistic, sharp focus. No text, no hands, no
cutlery, no glasses. Wide panoramic composition, both plates centred in a
narrow horizontal band.
```

*Пустота между тарелками — не брак композиции, а смысл: это порядок, а не
сервировка.*

## 6. Полоса 6, четыре шага — `greens-first.jpg` (16:9 → обрезать)

```
Ultra-wide horizontal lifestyle food photography: the hands of an adult gently
opening a plain unbranded transparent pack of fresh microgreens over a small
white plate at a home dining table; in the soft-focus background a covered
dish waits its turn. Warm natural daylight, emerald green accents, clean
neutral tabletop, Central Asian home interior hinted in the blur. Unhurried
everyday domestic mood. Photorealistic, shallow depth of field. No text, no
brand labels or printed packaging, no faces. Wide panoramic composition,
hands and plate centred in a narrow horizontal band.
```

*Руки — да, лицо — нет: релиз на модель нам не нужен.*

---

## Что дальше

1. Сложить готовые файлы в `content/generated/img/` под именами выше.
2. Вписать их в `content/generated/shakar-01-print.html` (это мастер;
   `apps/web/public/magazine/shakar-01.html` собирается из него).
3. `node scripts/publish-magazine.mjs` — разложит ассеты и перепишет пути.
4. `node scripts/check-magazine-photos.mjs` — проверит разрешение слотов.
5. `node scripts/check-magazine-published.mjs` — сверит опубликованную
   копию с мастером.
