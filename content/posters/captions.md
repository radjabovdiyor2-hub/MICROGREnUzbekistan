# Тексты публикаций — кампания «Shakar va tartib / Сахар и порядок»

Готовые подписи к макетам из `content/posters/out/`. Кампания сопровождает
спецвыпуск FRESH WEEKLY № 03.

**Это же — источник фактов для `content_bot`.** Все цифры здесь проверены по
первоисточникам. Если бот или продавец хочет назвать число про сахар, зелень или
состав — оно берётся отсюда, а не выдумывается.

## Правила, которые нельзя нарушать

Заданы [doc/balans_concept.md](../../doc/balans_concept.md) §6.2.

**Точный стоп-список — в [scripts/check-claims.mjs](../../scripts/check-claims.mjs).**
Здесь он не переписан намеренно: список в двух местах разъезжается, а этот файл
уходит подрядчикам и сам входит в публичный контур — гейт проверяет и его.

Категории запрета: название болезни; заявление о влиянии на показатели крови;
лечение, излечение или снижение риска болезни; специальное назначение;
сравнительные множители и проценты без протокола испытаний.

Разрешено и составляет всю кампанию:

- ✅ состав в граммах и мкг, вкус, порядок подачи
- ✅ цитата исследования с автором и годом, если сказано, что оно не о нашем товаре
- ✅ дисклеймер на любом макете, где назван продукт

Проверка: `node scripts/check-claims.mjs` — падает с ненулевым кодом при совпадении.

Язык — по `apps/tgas/shared/brand.py` → `CONTENT_POLICY`: массовое и сторис —
узбекская латиница, B2B и HoReCa — русский, **не смешивать в одном посте**.
Заголовок ≤ 5 слов, одна фраза пользы, один CTA.

Хэштеги — только из `BRAND_HASHTAGS`.

---

## Instagram / Telegram, 4:5

### 1 · `post-1-jsst-meyori.png` — норма ВОЗ

**UZ (основной)**

> Kuniga 12 choy qoshiq.
>
> Jahon sog'liqni saqlash tashkiloti erkin shakarni kunlik energiyaning 10 % idan
> kam ushlashni tavsiya etadi — bu taxminan 50 gramm. 5 % dan kam bo'lsa,
> qo'shimcha foyda bor deb hisoblanadi: taxminan 25 gramm.
>
> Erkin shakar — bu ishlab chiqaruvchi, oshpaz yoki siz qo'shgan shakar,
> shuningdek asal, sirop va meva sharbatidagi shakar. Butun mevadagi shakar
> bunga kirmaydi.
>
> Bir banka shirin ichimlik ko'pincha kunlik me'yorni butunlay yopadi.
>
> Saqlang 👇
>
> #MicrogreenUzbekistan #SoglomOvqatlanish #Samarqand #Ovqat

**RU (для русскоязычной ленты — отдельным постом, не смешивать)**

> 12 чайных ложек в день.
>
> ВОЗ рекомендует держать свободные сахара ниже 10 % суточной энергии — это около
> 50 граммов. Ниже 5 % — около 25 граммов — считается дополнительно полезным.
>
> Свободные сахара — это сахар, добавленный производителем, поваром или вами, плюс
> сахар мёда, сиропов и фруктовых соков. Сахар целого фрукта сюда не входит.
>
> Одна банка сладкого напитка часто закрывает дневную норму целиком.
>
> Источник: WHO Guideline: Sugars intake for adults and children.

---

### 2 · `post-2-avval-yashil.png` — метод

**UZ**

> Avval yashil.
>
> Palov qoladi. Lag'mon ham, non ham qoladi. O'zgaradigan narsa bitta — nimani
> birinchi bo'lib yeyish.
>
> 1. Asosiy taomdan 10–15 daqiqa oldin ko'katni yeng
> 2. Sousni berishdan oldin qo'shing — kislotada ko'kat bir soatda cho'kadi
> 3. Yaxshilab chaynang
> 4. Isitmang: 70 °C dan yuqorida C vitamini va mirozinaza parchalanadi
>
> Usul mahsulot emas — tartib. Uni har qanday yangi sabzavot bilan bajarish mumkin.
>
> Saqlang 👇
>
> #MicrogreenUzbekistan #Salat #UyOshxonasi #Mazali

**RU**

> Метод «Сначала зелень».
>
> Плов остаётся. Лагман и нон тоже. Меняется одно — что вы съедаете первым.
>
> Порядок еды изучали в рандомизированных кросс-over исследованиях: когда овощи и
> белок шли до углеводов, подъём глюкозы и инсулина после еды был заметно ниже.
> Результат воспроизведён независимыми группами.
>
> Метод — это не продукт, а порядок. Соблюдать его можно с любыми свежими овощами.
>
> Источники: Shukla и соавт., 2015 · Kuwata и соавт., 2016 · Nutrients, 2023.

---

### 3 · `post-3-tarkib.png` — состав

**UZ**

> 100 g qadoqda nima bor.
>
> BALANS «Yumshoq»: 25 kkal · uglevod 3,3 g · tola 2,0 g · oqsil 3,2 g ·
> K vitamini 103 mkg.
>
> Tarkibi: no'xat 35 %, kungaboqar 20 %, tatsoy 20 %, mizuna 15 %, brokkoli 10 %.
>
> Qiymatlar ekinlar ulushi bo'yicha hisoblangan — bu laboratoriya bayonnomasi emas.
> Mahsulot davolovchi yoki parhez ovqat emas.
>
> 35 000 so'm · 100 g
>
> Buyurtma berish 👇
>
> #MicrogreenUzbekistan #Microgreen #Salat #Samarqand

**RU (HoReCa / B2B)**

> Что внутри пачки — в граммах, а не в обещаниях.
>
> BALANS «Мягкий», 100 г: 25 ккал · углеводы 3,3 г · клетчатка 2,0 г · белок 3,2 г ·
> витамин K 103 мкг. Состав: горох 35 %, подсолнечник 20 %, татсой 20 %,
> мизуна 15 %, брокколи 10 %.
>
> Значения рассчитаны по долям культур — это не лабораторный протокол.
> Продукт не является лечебным или диетическим питанием.
>
> 35 000 сум за 100 г. Доставка по Самарканду в день заказа.

---

### 4 · `post-4-kechagi-palov.png` — остывший плов

**UZ**

> Kechagi palov.
>
> Guruch sovutilganda kraxmalning bir qismi rezistent kraxmalga aylanadi — u
> ingichka ichakda parchalanmaydi. Qayta isitilgandan keyin ham shu holatda qoladi.
>
> Rezistent kraxmal: 0,64 → 1,65 g/100 g (24 soat 4 °C da sovutilgandan keyin).
>
> Palovni kechqurun pishiring, bir kecha muzlatgichda saqlang va ertasi kuni
> qizdiring. Ta'mi yomonlashmaydi.
>
> Bu maslahat bepul — hech narsa sotib olish shart emas.
>
> Saqlang 👇
>
> #MicrogreenUzbekistan #Ovqat #Retsept #UyOshxonasi

**RU**

> Вчерашний плов.
>
> При охлаждении риса часть крахмала переходит в резистентный — он не расщепляется
> в тонкой кишке, и после разогрева свойство сохраняется.
>
> Резистентный крахмал: 0,64 → 1,65 г/100 г после 24 часов при 4 °C.
> Гликемический ответ: 125 против 152 ммоль·мин/л.
>
> Приём бесплатный: покупать ничего не нужно. Мы рассказываем его именно поэтому.

---

## Сторис, 9:16

Форматы соответствуют архетипам `MORNING_FORMATS` в
`apps/tgas/shared/content_plan.py`. Язык — узбекский.

| Файл | Архетип | Бейдж | CTA | Текст поверх макета |
|---|---|---|---|---|
| `story-1-fact-meyor.png` | `fact` | BILARMIDINGIZ? | Saqlang | Всё на макете, подпись не нужна |
| `story-2-tip-kechagi-palov.png` | `tip` | LIFEHACK | Saqlang | «Palovni kechqurun pishiring — ertaga qizdiring» |
| `story-3-tanlang-tartib.png` | `this_or_that` | TANLANG | Опрос: «Avval palov» / «Avval yashil» | Стикер опроса ставится поверх двух плашек |
| `story-4-retsept-palovga.png` | `mini_recipe` | 15 SONIYA | Buyurtma berish | Ссылка-стикер на `/balans` |

Сторис 3 — единственная с интерактивом. Стикер опроса кладётся ровно на две
плашки макета, варианты подписаны на нём же.

---

## Печать

| Файл | Формат | Куда |
|---|---|---|
| `print-a3-usul.pdf` | A3, 297×420 мм | Точки продаж, рестораны-партнёры, ярмарки |
| `print-a4-balans.pdf` | A4, 210×297 мм | Стойка на точке, вкладыш в заказ, папка для HoReCa |

Оба листа печатаются на готовом формате без обрезки: вылетов нет, поле держит
текст внутри. QR ведёт на `/balans`.

---

## Что НЕ писать в комментариях и в личке

Под такими постами всегда приходит вопрос «а это помогает при болезни?».
Ответ продавца и бота — один:

> Мы не даём медицинских рекомендаций и не заявляем лечебных свойств. На упаковке
> указан состав: калорийность, углеводы, клетчатка, белок и витамин K. По вопросам
> здоровья — к врачу.

Дальше — не продолжать, в спор не вступать, исследования в переписке не
пересказывать. Научная часть кампании живёт только в номере журнала (полоса 9),
где она подана с уровнями доказательств и оговорками; закрытое досье
`doc/dossier_glycemia.md` в переписку не уходит.

**Отдельно:** тем, кто принимает варфарин, важна постоянная доза витамина K.
Это единственное взаимодействие, о котором мы говорим вслух — и только в форме
«обсудите с врачом», без советов.
