# Видео блюда для «Живого меню» — мастер-промпт для Google Flow (Veo)

Ролик, который открывается по печатному QR: гость наводит камеру на блюдо в
журнале → `/m/<slug>/d/<code>` → вертикальное видео, где блюдо оживает.

Пайплайн приёма готов (`Dish.videoUrl` / `videoPoster`, загрузка через админку
→ вкладка «Меню» → «Добавить видео»). Здесь — как эти ролики генерировать, чтобы
все шесть смотрелись одним номером, а не набором случайных клипов.

---

## Концепция: «Стол → блюдо → макро»

Все шесть роликов **начинаются с одного накрытого стола Jasmin** — это общий «дом»
серии. Дальше камера улетает к своему блюду и ныряет в макро. Видео продаёт
**само блюдо** — сочно, аппетитно. Микрозелень тащить в каждый кадр не нужно: она
появляется только там, где и так лежит (горошек на плове, зелень в салате).

**Ключевое правило камеры — одно непрерывное движение вперёд, без разворота
назад.** Развороты (макро → отъезд на общий) — это ровно то место, где Veo
«плывёт» и мылит картинку. Поэтому камера едет только вперёд и в конце садится
на блюдо.

### 8 секунд

| Такт | Что в кадре |
|---|---|
| 0–2 с | накрытый стол: нужное блюдо на первом плане и в фокусе, остальное (лепёшки, чайник, соседние блюда) — в мягком размытии. Пар. Камера трогается к блюду |
| 2–5 с | камера **ныряет низко и близко** над блюдом — макро-проход: текстура, пар, блик жира. Это и есть «вкусный» момент |
| 5–8 с | камера чуть поднимается и **садится на геройский план** блюда по центру. Последняя 1 с — полностью статична |

Последний статичный кадр → с него снимается постер (то, что гость видит до старта
видео). Поэтому финал должен быть чистым и неподвижным.

---

## 1. Жёсткие требования (не стиль — иначе не заработает)

| Параметр | Значение | Почему |
|---|---|---|
| Кадр | вертикальный **9:16, 1080×1920** | совпадает с камерой «Снять кадр»; один формат на весь продукт |
| Длина | **8 секунд** | предел одной генерации Flow |
| Реализм | **ультра-реалистично**, «снято на камеру», не CGI/рендер | еда должна выглядеть настоящей, иначе не аппетитно |
| Звук | **две версии** (см. §4) | сайт играет `muted`, звук нужен только соцсетям |
| Текст в кадре | **нет** — ни подписей, ни цен, ни логотипов | подписи даёт страница; вшитый текст не перевести и не починить |
| Движение камеры | **только вперёд, без разворота назад** | обратный отъезд у Veo мылит и «плывёт» |
| Финал | последняя **~1 с статична**, блюдо по центру | из этого кадра берётся постер |
| Человек | **не нужен**; руки — только где естественно (налить чай) | герой — еда, а не персонаж |

---

## 2. Мастер-шаблон промпта

Копируется как есть, подставляются четыре переменные: `{{DISH}}`, `{{VESSEL}}`,
`{{SIGNATURE}}`, `{{FOLEY}}`. Остальное — фиксировано.

```
Ultra-realistic, photoreal vertical 9:16 food video, 1080x1920, exactly 8 seconds.
Shot on a professional cinema camera with a macro lens; natural motion blur, real steam,
real textures. NOT animation, NOT CGI, NOT a render. Warm natural daylight coming from
the left, as from a window.

SETTING: a laid Uzbek restaurant table (dastarkhan). The dish — {{DISH}} — served in
{{VESSEL}}, traditional Uzbek blue-and-white ceramic, is in the foreground and in
razor-sharp focus. Other Uzbek dishes, flatbread and a teapot are softly blurred around
it. Gentle real steam rises. The restaurant interior is heavily blurred far in the
background.

CAMERA — ONE continuous forward move, it never reverses:
  0-2s: a wide view of the laid table; the camera begins gliding toward the dish.
  2-5s: the camera dives low and close, skimming just above the surface of the dish —
        {{SIGNATURE}} — texture, rising steam and glistening detail in rich macro.
  5-8s: the camera rises only slightly and settles into a clean, centred hero shot of
        the finished dish. The final 1 second is completely static.
No reverse dolly, no pulling back to a wide shot, no orbit, no shake, no rack focus.

STYLE: rich natural colours, shallow depth of field, appetising food-porn look, soft
steam, warm and inviting, hyper-detailed and realistic.

AUDIO: warm gentle background music with a subtle Uzbek/oriental motif, low in the mix;
realistic food foley — {{FOLEY}} — plus faint warm restaurant ambience. No voice, no
speech, no narration.

NEGATIVE PROMPT: text, captions, subtitles, letters, numbers, logos, watermarks,
on-screen graphics, UI, voice, speech, voices, loud music, people, hands (unless
specified), camera shake, fast cuts, warping, morphing, cartoon or CGI or plastic look,
the camera pulling back to a wide shot at the end, plastic packaging, wilted or
dried-out food.
```

`{{SIGNATURE}}` — аппетитный момент, который камера показывает в макро (2–5 с).
`{{FOLEY}}` — звук самого блюда. У каждого блюда свои.

> **Модель — Veo 3.1 (quality).** Она генерирует звук нативно: музыка и foley из
> блока AUDIO попадут прямо в ролик, отдельный редактор не нужен. Для сайта эту
> дорожку потом снимаем (см. §4) — плеер играет `muted`.

---

## 3. Шесть готовых промптов (меню Jasmin)

Коды и названия — как в печатном номере. Загружать строго к своему коду.

### 01 · Samarqandcha palov (Самаркандский плов) — хит недели
- `{{DISH}}` = `Samarkand plov: rice with chunks of lamb, yellow carrot strips and chickpeas, a few pea shoots resting on top`
- `{{VESSEL}}` = `a wide round ceramic lagan plate`
- `{{SIGNATURE}}` = `steam curling off the rice, oil glistening on the lamb, individual grains and carrot strips sharp in macro`
- `{{FOLEY}}` = `soft sizzle and quiet crackle of the hot plov, gentle steam hiss`

### 02 · Tandir kabob (Кебаб из тандыра)
- `{{DISH}}` = `grilled lamb kebab on skewers, charred edges, juicy`
- `{{VESSEL}}` = `a long narrow ceramic plate`
- `{{SIGNATURE}}` = `char marks and rendered fat glistening on the meat, thin smoke rising off the grilled edges`
- `{{FOLEY}}` = `sizzle of grilled meat and the faint crackle of charcoal embers`

### 03 · Lag'mon (Лагман с домашней лапшой)
- `{{DISH}}` = `lagman: hand-pulled noodles in a rich broth with beef and vegetables`
- `{{VESSEL}}` = `a deep ceramic bowl`
- `{{SIGNATURE}}` = `glossy noodles coated in broth, steam rising, a few noodles slowly settling into the soup`
- `{{FOLEY}}` = `gentle bubbling of hot broth and soft steam`

### 04 · Somsa (Самса из тандыра)
- `{{DISH}}` = `tandoor samsa: golden flaky pastry parcels with a sesame-topped crust, one already broken open`
- `{{VESSEL}}` = `a flat round ceramic plate`
- `{{SIGNATURE}}` = `flaky golden crust with sesame seeds, steam bursting from the broken-open samsa, juicy filling visible`
- `{{FOLEY}}` = `crisp crackle of flaky pastry breaking and a soft steam puff`

### 05 · Achchiq-chuchuk (Салат к плову)
- `{{DISH}}` = `achichuk salad: thin-sliced ripe tomatoes and red onion rings, a little fresh basil`
- `{{VESSEL}}` = `a shallow ceramic bowl`
- `{{SIGNATURE}}` = `juicy ripe tomato slices and onion rings glistening, a thin drizzle of oil catching the light`
- `{{FOLEY}}` = `crisp fresh vegetables and a light oil drizzle over quiet ambience`

### 06 · Choy va shirinliklar (Чай и десерты)
- `{{DISH}}` = `a pot of black tea with a piala cup and traditional Uzbek sweets and dried fruit`
- `{{VESSEL}}` = `a ceramic tea set on a small tray`
- `{{SIGNATURE}}` = `amber tea being poured into the piala by a hand, steam rising, sweets and dried fruit beside it` *(единственный ролик, где рука уместна)*
- `{{FOLEY}}` = `tea pouring into the piala, gentle steam and a quiet clink of ceramic`

---

## 4. Две версии: сайт и соцсети

Один ролик — два экспорта:

| | Сайт (грузим в админку) | Соцсети (Instagram/Telegram) |
|---|---|---|
| Звук | **удалить дорожку** | музыка + foley оставить |
| Почему | плеер играет `muted`, звук не проиграет и утяжелит файл | там звук решает |
| Вес | ≤ 8 МБ (жёсткий предел, админка отклонит тяжелее; цель ≤ 6) | не важен |

**Экспорт для сайта** (ffmpeg на сервере нет, файл должен приезжать готовым):

| Параметр | Значение |
|---|---|
| Контейнер / кодек | MP4, H.264 профиль High, `yuv420p` |
| Разрешение | 1080×1920 |
| Битрейт | ~2 Мбит/с |
| `faststart` | включить (иначе видео не начнёт играть, пока не скачается целиком) |
| Звук | **нет** |
| Вес | **цель ≤ 6 МБ, жёсткий предел 8 МБ** |

Если Flow отдаёт тяжелее 8 МБ — прогнать через HandBrake: пресет «Fast 1080p30»,
Web Optimized ✓, звук None.

---

## 5. Чек-лист перед загрузкой

- [ ] Вертикальный 9:16, звука нет, вес ≤ 8 МБ
- [ ] Камера едет **только вперёд**, в конце не отъезжает на общий план
- [ ] Последняя секунда статична, блюдо целое по центру (из неё берётся постер)
- [ ] В кадре нет текста, цен, логотипов; людей нет (кроме руки в ролике 06)
- [ ] Стол на старте узнаётся как накрытый дастархан Jasmin
- [ ] Загружено к **правильному коду**: 01 плов, 02 кебаб, 03 лагман, 04 самса,
      05 ачик-чучук, 06 чай. Код в журнале напечатан намертво — перепутанный
      ролик = бумага врёт
