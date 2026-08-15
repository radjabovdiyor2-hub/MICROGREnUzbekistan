# content/generated — собранные номера

## Спецвыпуск «Shakar va tartib» — другая цепочка

Номер № 03 собирается **не так**, как описанный ниже jasmin: у него нет
дизайн-слоя и шага `apply-magazine-design.mjs`. Он свёрстан вручную сразу
в готовом виде и лежит в источниках, а не здесь:

| что | где |
|---|---|
| вёрстка и тексты, 12 полос | `content/generated/shakar-01-print.html` |
| оформление | тот же `content/templates/fresh-weekly-a5.design.css` |
| QR на `/balans` | `content/generated/qr-balans.png` |
| закрытая доказательная база | `doc/dossier_glycemia.md` — **не публикуется** |

⚠️ Единственный файл в этой папке, который **правится руками**. Он ничем не
перезаписывается — `apply-magazine-design.mjs` его не трогает — и внесён в
`.gitignore` отдельной строкой-исключением, иначе потерялся бы под общим `*.html`.

```bash
node scripts/magazine-pdf.mjs content/generated/shakar-01-print.html
node scripts/shoot-magazine-pages.mjs content/generated/pages-shakar "" \
     --src=content/generated/shakar-01-print.html      # пруфы полос
node scripts/check-claims.mjs                          # стоп-список §6.2 — обязателен
node scripts/publish-magazine.mjs                      # → apps/web/public/magazine/
node scripts/check-magazine-published.mjs              # открывается и с сервера, и двойным щелчком
```

QR пересобирается одной строкой, если поменяется адрес:

```bash
node -e "require('qrcode').toFile('content/generated/qr-balans.png','https://microgreenuzbekistan.com/balans',{margin:4,errorCorrectionLevel:'M',width:1024})"
```

**Тексты этого номера подчинены [doc/balans_concept.md](../../doc/balans_concept.md) §6.2:**
никаких заявлений о лечебных и оздоровительных свойствах. `check-claims.mjs`
исполняет это правило машиной и падает с ненулевым кодом — прогонять после
любой правки текста, а не только вёрстки.

Рекламные макеты кампании — `content/posters/`, сборка
`node scripts/render-posters.mjs`, тексты публикаций — `content/posters/captions.md`.

---

## В печать идёт этот файл

**`jasmin-print.html`** — готов к типографии: 12 полос по 154 × 216 мм, шрифты
и QR встроены, интернет не нужен.

**`jasmin-a4-booklet.html`** — тот же номер в раскладке под домашнюю печать:
6 листов A4 landscape, по два чистых A5 на лист, сгиб посередине. Печатать
двусторонне, **переворот по короткой стороне**, масштаб 100 %. Памятка есть внутри
файла — на экране видна, в печать не идёт.

PDF для печатника делается по требованию (`scripts/magazine-pdf.mjs`) и в
репозитории не хранится: устаревший PDF опаснее отсутствующего — его легко
отправить в тираж вместо актуального.

## Как пересобрать

Номер верстается вручную; автоматической сборки из шаблона больше нет. Осталась
цепочка из четырёх шагов и трёх проверок:

```bash
node scripts/build-magazine-qr.mjs        # QR из конфига (menuSlug + dishCodes)
node scripts/apply-magazine-design.mjs    # дизайн-слой → jasmin-print.html
node scripts/build-booklet.mjs            # раскладка A4 под сгиб
node scripts/check-magazine-qr.mjs        # адреса кодов сходятся с конфигом
node scripts/check-magazine-fit.mjs       # контент не уходит под обрез
node scripts/check-magazine-photos.mjs    # снимки держат 300 dpi
node scripts/magazine-pdf.mjs             # PDF для типографии
```

Правки вносятся не здесь, а в источники:

| что менять | где |
|---|---|
| тексты полос | `content/templates/jasmin-print.baseline.html` |
| оформление | `content/templates/fresh-weekly-a5.design.css` |
| точечные правки разметки | `scripts/apply-magazine-design.mjs` |
| адреса QR, фото, данные ресторана | `content/templates/jasmin.json` |

**Файлы в этой папке — машинный результат.** Править их руками не нужно: следующий
прогон `apply-magazine-design.mjs` всё перезапишет. Он, кстати, падает, если хоть
одна строка-анкер не найдена, и тогда файл не пишется вовсе — это единственная
защита от того, что случилось 30.07.2026, когда сторонний скрипт с жадной
регуляркой снёс полосы 6–7 и половину QR.

**Проверки прогонять после любой правки вёрстки.** Высота полосы фиксирована и стоит
`overflow: hidden`: лишний контент не ломает макет заметно, он молча уходит под обрез.

Полная спека (размеры фото, бумага и краски, спуск полос, чек-лист перед отправкой):
[docs/magazine-print-spec.md](../../docs/magazine-print-spec.md).

---

## Почему старый прототип в архиве

Первая версия номера лежит в `content/archive/2026-07-jasmin-prototype/`
(`jasmin-w1-*`, `non-kabob-w1.html`, превью и фото-промпты). Она **не пригодна
для типографии** — чтобы её случайно не отправили в печать:

| Что не так | Почему это блокер |
|---|---|
| 9 полос | Скрепка требует кратности 4 — не сброшюровать |
| Нет вылетов (`148×210`, `margin: 0`) | Обложка в край → по обрезу белые полосы |
| QR на стр. 9 битый | data-URI не парсится, промо-механика полосы мертва |
| Фото 1024×1024 | ~175 dpi на обложке при норме 300; квадрат в прямоугольном окне режется вслепую |
| Шрифты с Google Fonts по сети | Печатный файл должен собираться без интернета |
| «Фото → сразу промокод −15 %» | Система так не работает: кадр → штамп (1/день) → 5 штампов → промокод |

Архив оставлен как история и источник текстов — удалять его не нужно.

Последний пункт про 1024×1024 актуален и сейчас: обложка текущего номера всё ещё
такая, это 120 dpi. Проверяется `check-magazine-photos.mjs`.
