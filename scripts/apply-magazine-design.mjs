// ════════════════════════════════════════════════════════════
// Дизайн-слой печатного номера FRESH WEEKLY.
//   node scripts/apply-magazine-design.mjs
//
// Что делает: берёт базовый номер (content/templates/jasmin-print.baseline.html —
// полосы с текстами и фото, QR ещё растровые), заменяет в нём вшитые шрифты
// и таблицу стилей, подставляет векторные QR и вносит точечные правки
// в разметку. Пишет content/generated/jasmin-print.html.
//
// baseline — закоммиченный артефакт, а не воспроизводимый: шаблон с
// плейсхолдерами и сборщик build-magazine.mjs удалены, номер верстается
// вручную. Тексты полос правятся прямо в baseline, оформление — в
// .design.css, разметка — здесь.
//
// Правки идемпотентны: всегда применяются к baseline, а не к прошлому
// результату, поэтому запуск можно повторять сколько угодно раз.
// Каждая правка проверяется — если строка-анкер не найдена, скрипт падает
// и НЕ пишет файл. Это единственная защита от того, что случилось
// 30.07.2026: сторонний скрипт с жадной регуляркой снёс полосы 6–7.
// ════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(ROOT, 'content', 'generated', 'jasmin-print.html');
const SRC = join(ROOT, 'content', 'templates');

// Правки всегда накатываются на исходный файл, а не на прошлый результат —
// пересборка идемпотентна, и любую итерацию можно повторить с нуля.
// Файл лежит с CRLF. Ищем по LF, при записи перевод строки возвращаем,
// иначе многострочные шаблоны не находятся.
const raw = await readFile(process.argv[2] ?? join(SRC, 'jasmin-print.baseline.html'), 'utf8');
const orig = raw.replace(/\r\n/g, '\n');
const fonts = (await readFile(join(SRC, 'fonts', 'fonts-subset.css'), 'utf8')).replace(/\r\n/g, '\n');
const css = (await readFile(join(SRC, 'fresh-weekly-a5.design.css'), 'utf8')).replace(/\r\n/g, '\n');

let html = orig;
let n = 0;
const fail = [];

/** Замена с проверкой: сколько раз ждём — столько раз и должно найтись. */
function sub(from, to, times = 1) {
  const found = html.split(from).length - 1;
  if (found !== times) { fail.push(`${found}× вместо ${times}×: ${from.slice(0, 90)}`); return; }
  html = html.split(from).join(to);
  n++;
}

// ── 1. Шрифты и стили ────────────────────────────────────────────
// Всё между <style> и строкой с фирменными цветами — это вшитые
// @font-face плюс таблица стилей. Меняем целиком.
const styleStart = html.indexOf('<style>') + '<style>'.length;
const brandVars = html.match(/\n:root\{--accent:[^}]+\}\n<\/style>/);
if (!brandVars) throw new Error('не найден блок фирменных цветов перед </style>');
const styleEnd = html.indexOf(brandVars[0]);
html = html.slice(0, styleStart) + '\n' + fonts + '\n' + css + html.slice(styleEnd);
n++;

// ── 2. Обложка ───────────────────────────────────────────────────
// Затемнение выносим в класс: градиент нужно было усилить в середине
// полосы, иначе золотая строка заголовка ложится на светлое место кадра.
sub(
  `  <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.62) 0%,rgba(0,0,0,.14) 32%,rgba(0,0,0,.18) 48%,rgba(0,0,0,.52) 62%,rgba(0,0,0,.82) 84%,rgba(0,0,0,.94) 100%);"></div>`,
  `  <div class="cover-scrim"></div>`
);

// Логотип издания, шапка и подвал обложки — на классы вместо инлайна.
sub(
  `    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-family:'Playfair Display',serif;font-size:32pt;font-weight:900;line-height:.9;">FRESH</div>
        <div class="ui" style="font-size:6.5pt;font-weight:700;letter-spacing:8px;color:rgba(255,255,255,.6);margin-top:2mm;">WEEKLY</div>
      </div>
      <div class="ui" style="text-align:right;font-size:6.5pt;color:rgba(255,255,255,.6);line-height:1.6;">
        <span style="font-family:'Playfair Display',serif;font-size:9.5pt;font-weight:900;color:var(--gold);">№1</span><br>UZ · RU
      </div>
    </div>`,
  `    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div class="nameplate">FRESH</div>
        <div class="nameplate-sub">Weekly</div>
      </div>
      <div style="text-align:right;">
        <div class="cover-issue">№1</div>
        <div class="cover-dateline">Iyul 2026<br>UZ · RU</div>
      </div>
    </div>`
);

sub(
  `      <div style="font-family:'Playfair Display',serif;font-size:24pt;font-weight:900;line-height:1.12;">
        Hafta mehmoni:<br><span style="color:var(--gold);">oilaviy «Jasmin»</span>
      </div>`,
  `      <div class="cover-title">
        Hafta mehmoni:<br><span class="accent">oilaviy «Jasmin»</span>
      </div>`
);

sub(
  `        <div style="font-family:'Cormorant Garamond',serif;font-size:11pt;font-style:italic;color:rgba(255,255,255,.88);line-height:1.4;">
          An’anaviy o‘zbek taomlari, uy qulayligi va Samarqand ruhi.
        </div>`,
  `        <div class="cover-deck">
          An’anaviy o‘zbek taomlari, uy qulayligi va Samarqand ruhi.
        </div>`
);

// Рубрики номера: была строка скруглённых «чипов» — интерфейсный элемент.
// Стало: капитель через золотой разделитель на волосяной линейке.
sub(
  `      <div style="display:flex;gap:2.5mm;margin-top:4mm;flex-wrap:wrap;">
        <span class="ui" style="font-size:5.5pt;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.55);border:.5px solid rgba(255,255,255,.32);padding:1mm 2.5mm;border-radius:1mm;">O‘zbek taomlari</span>
        <span class="ui" style="font-size:5.5pt;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.55);border:.5px solid rgba(255,255,255,.32);padding:1mm 2.5mm;border-radius:1mm;">Oila</span>
        <span class="ui" style="font-size:5.5pt;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.55);border:.5px solid rgba(255,255,255,.32);padding:1mm 2.5mm;border-radius:1mm;">Retseptlar</span>
      </div>`,
  `      <div class="cover-tags" style="margin-top:4mm;">
        <span>O‘zbek taomlari</span><i>·</i><span>Oila</span><i>·</i><span>Retseptlar</span>
      </div>`
);

sub(
  `    <div class="ui" style="border-top:.5px solid rgba(255,255,255,.22);padding-top:3mm;display:flex;justify-content:space-between;font-size:6pt;color:rgba(255,255,255,.55);">
      <span>© Microgreen Uzbekistan &amp; Jasmin</span>
      <span style="color:var(--gold);font-weight:600;">freshweekly.uz</span>
    </div>`,
  `    <div class="cover-foot">
      <span>© Microgreen Uzbekistan &amp; Jasmin</span>
      <span class="site">freshweekly.uz</span>
    </div>`
);

// ── 3. Ярлыки рубрик ─────────────────────────────────────────────
// Инлайновый цвет мешал стилям выбрать нужный оттенок золота по фону:
// на кремовой плашке нужен затемнённый, на тёмной — фирменный.
sub(`<div class="kicker" style="color:var(--gold);">`, `<div class="kicker">`, 6);

// ── 4. Вводки под заголовками ────────────────────────────────────
// Перевод названия материала — это вводка, а не подпись: курсив
// текстовой антиквы на увеличенном кегле вместо мелкого Inter.
for (const t of [
  'Салат с микрозеленью и розовыми томатами · 15 daqiqa',
  'Что даёт микрозелень',
  'Маленький шеф: фруктовые картины на тарелке',
  'Кадры наших гостей за прошлую неделю',
  'Индор-ферма в Самарканде',
]) sub(`<div class="caption">${t}</div>`, `<div class="deck">${t}</div>`);

// Служебные надстрочники — отдельный класс, без инлайна
sub(
  `<div class="caption" style="letter-spacing:1.5px;text-transform:uppercase;margin-top:1mm;">Содержание</div>`,
  `<div class="subhead">Содержание</div>`
);
sub(
  `<div class="caption">Samarqand · Amir Temur ko'chasi 202 · @jasminsamarkand</div>`,
  `<div class="dateline">Samarqand · Amir Temur ko‘chasi 202 · @jasminsamarkand</div>`
);

// ── 5. Задняя обложка ────────────────────────────────────────────
sub(`<div class="mag-page" style="background:var(--accent);">`, `<div class="mag-page back" style="background:var(--accent);">`);

// Инверсные цвета текста уходят в стили: инлайн не давал их переопределить
sub(`<div class="h1" style="color:#fff;margin-top:2mm;">`, `<div class="h1" style="margin-top:2mm;">`);
sub(`<div class="lang-pair body" style="color:rgba(255,255,255,.85);margin-top:2mm;">`, `<div class="lang-pair body" style="margin-top:2mm;">`);
sub(`<div class="lang-pair body" style="color:rgba(255,255,255,.85);margin-top:1.5mm;">`, `<div class="lang-pair body" style="margin-top:1.5mm;">`);
sub(`<div class="lang-pair body" style="color:rgba(255,255,255,.9);">`, `<div class="lang-pair body">`, 3);
sub(`<div class="lang-pair body" style="color:rgba(255,255,255,.9);margin-top:1mm;">`, `<div class="lang-pair body" style="margin-top:1mm;">`);
sub(`<div class="ru" style="color:rgba(255,255,255,.72);border-left-color:rgba(255,255,255,.28);">`, `<div class="ru">`, 6);
sub(`<div class="step-num" style="background:var(--gold);color:var(--accent);">`, `<div class="step-num">`, 3);
sub(`<div class="stamp" style="border-color:var(--gold);color:rgba(255,255,255,.7);">`, `<div class="stamp">`, 5);
sub(`<div class="body" style="color:rgba(255,255,255,.9);margin-top:1mm;">`, `<div class="body" style="margin-top:1mm;">`, 2);

// Золотые ярлыки задней обложки — на волосяной линейке, как ярлыки внутри
for (const t of ['Mehmon kartasi · Карта гостя', 'Skanerlang · Сканируйте', 'Restoran · Ресторан', 'Ferma · Ферма']) {
  const px = t === 'Mehmon kartasi · Карта гостя' ? '2px' : '1.5px';
  sub(
    `<div class="ui" style="font-size:6pt;font-weight:700;letter-spacing:${px};text-transform:uppercase;color:var(--gold);">${t}</div>`,
    `<div class="back-label">${t}</div>`
  );
}

// Панель с QR: рамка со скруглением 2 мм → линейки сверху и снизу
sub(
  `<div style="display:flex;gap:4mm;align-items:center;background:rgba(255,255,255,.08);border:1px solid var(--gold);border-radius:2mm;padding:3mm;">`,
  `<div class="back-panel">`
);
sub(`<div class="menu-qr" style="width:20mm;background:#fff;padding:1mm;border-radius:1mm;">`, `<div class="menu-qr" style="width:20mm;background:#fff;padding:1mm;">`);
sub(`<div class="menu-qr" style="width:18mm;background:#fff;padding:1mm;border-radius:1mm;">`, `<div class="menu-qr" style="width:18mm;background:#fff;padding:1mm;">`);

sub(
  `      <div class="ui" style="border-top:.5px solid rgba(255,255,255,.2);padding-top:3mm;display:flex;justify-content:space-between;font-size:6pt;color:rgba(255,255,255,.55);">
        <span>© Microgreen Uzbekistan &amp; Jasmin · Iyul 2026</span>
        <span style="color:var(--gold);font-weight:600;">freshweekly.uz</span>
      </div>`,
  `      <div class="back-foot">
        <span>© Microgreen Uzbekistan &amp; Jasmin · Iyul 2026</span>
        <span class="site">freshweekly.uz</span>
      </div>`
);

// ── 6. Дневник Fresh Kids ────────────────────────────────────────
// Скругления и инлайновые цвета клеток — в стили
sub(
  `<div class="stamp" style="width:100%;height:14mm;border-radius:1.5mm;border-style:solid;border-color:var(--rule);flex-direction:column;font-size:16pt;">`,
  `<div class="kids-cell">`,
  4
);
sub(
  `<div class="stamp" style="width:100%;height:14mm;border-radius:1.5mm;border-style:solid;border-color:var(--gold);flex-direction:column;font-size:16pt;">`,
  `<div class="kids-cell gold">`
);

// ── 7. Задняя обложка: ритм блоков задают стили, не инлайн ───────
sub(`<div class="page-body no-header" style="justify-content:space-between;">`, `<div class="page-body no-header">`);

// Машинописный апостроф в адресе — на типографский, как в остальном номере
sub(`Samarqand · Amir Temur ko'chasi 202<br>`, `Samarqand · Amir Temur ko‘chasi 202<br>`);

// ── 8. QR-коды ───────────────────────────────────────────────────
// Было: код блюда 01 — PNG в base64, 02–03 — другой PNG, 04–06 —
// внешние PNG-файлы, остальные — SVG. Разный модуль, разная тихая
// зона, разная плотность: на развороте шесть кодов выглядели как
// шесть разных объектов, а растровые ещё и мылят на 300 dpi.
// Стало: все девять — вектор с одинаковым модулем и тихой зоной.
// Адреса сняты декодером с исходного макета и не изменены.
const qr = JSON.parse(await readFile(join(SRC, 'jasmin-qr.json'), 'utf8'));

// ПОРЯДОК ВАЖЕН. Сначала три кода, которые в baseline уже векторные
// (рецепт, меню, бот), и только потом коды блюд, которые в baseline —
// растровые <img>. Если сделать наоборот, вставленные коды блюд станут
// такими же <svg>, и любой проход «по оставшимся svg» их перезапишет:
// адрес блюда и адрес рецепта дают одинаковый размер матрицы 41×41,
// различить их постфактум нечем. На этом я и попался — шесть кодов блюд
// молча превратились в код рецепта, поймало только декодирование.
//
// Каждый код адресуется своим контейнером, а не размером матрицы:
//   рецепт  — .menu-qr width:22mm, рядом подпись «Retsept onlayn»
//   меню    — .menu-qr width:18mm (полоса 7) и width:20mm+фон (полоса 12)
//   бот     — .menu-qr width:18mm+фон (полоса 11)
const vectorQr = [
  ['рецепт (полоса 5)', /(<div class="menu-qr" style="width:22mm;">\s*)<svg xmlns[\s\S]*?<\/svg>/, qr.RECIPE, 1],
  ['меню (полоса 7)', /(<div class="menu-qr" style="width:18mm;">)<svg xmlns[\s\S]*?<\/svg>/, qr.MENU, 1],
  ['бот (полоса 11)', /(<div class="menu-qr" style="width:18mm;background:#fff;padding:1mm;">)<svg xmlns[\s\S]*?<\/svg>/, qr.BOT, 1],
  ['меню (полоса 12)', /(<div class="menu-qr" style="width:20mm;background:#fff;padding:1mm;">)<svg xmlns[\s\S]*?<\/svg>/, qr.MENU, 1],
];
for (const [label, re, svg, times] of vectorQr) {
  const hits = html.match(new RegExp(re.source, 'g'));
  if (!hits || hits.length !== times) { fail.push(`QR ${label}: ${hits ? hits.length : 0}× вместо ${times}×`); continue; }
  html = html.replace(new RegExp(re.source, 'g'), (_m, p1) => p1 + svg);
  n++;
}

// коды блюд: сопоставляем по номеру в .menu-code
const dishQr = [
  [/<div class="menu-qr hit"><img src="data:image\/png;base64,[^"]+"[^>]*><div class="menu-code">01<\/div>/, `<div class="menu-qr hit">${qr.D1}<div class="menu-code">01</div>`],
  [/<div class="menu-qr"><img src="data:image\/png;base64,[^"]+"[^>]*><div class="menu-code">02<\/div>/, `<div class="menu-qr">${qr.D2}<div class="menu-code">02</div>`],
  [/<div class="menu-qr"><img src="data:image\/png;base64,[^"]+"[^>]*><div class="menu-code">03<\/div>/, `<div class="menu-qr">${qr.D3}<div class="menu-code">03</div>`],
  [/<div class="menu-qr"><img src="qr-jasmin-04\.png"[^>]*><div class="menu-code">04<\/div>/, `<div class="menu-qr">${qr.D4}<div class="menu-code">04</div>`],
  [/<div class="menu-qr"><img src="qr-jasmin-05\.png"[^>]*><div class="menu-code">05<\/div>/, `<div class="menu-qr">${qr.D5}<div class="menu-code">05</div>`],
  [/<div class="menu-qr"><img src="qr-jasmin-06\.png"[^>]*><div class="menu-code">06<\/div>/, `<div class="menu-qr">${qr.D6}<div class="menu-code">06</div>`],
];
for (const [re, to] of dishQr) {
  const hits = html.match(new RegExp(re.source, 'g'));
  if (!hits || hits.length !== 1) { fail.push(`QR: ${hits ? hits.length : 0}× вместо 1×: ${re.source.slice(0, 60)}`); continue; }
  html = html.replace(re, to);
  n++;
}

// Контроль: в номере должно остаться ровно 10 кодов и ни одного растрового
{
  const svg = (html.match(/<svg xmlns/g) || []).length;
  const img = (html.match(/<div class="menu-qr[^>]*>\s*<img/g) || []).length;
  if (svg !== 10) fail.push(`QR: векторных кодов ${svg}, ожидалось 10`);
  if (img !== 0) fail.push(`QR: осталось растровых кодов ${img}, ожидалось 0`);
}

// ── 9. Вопросы «Три вопроса»: кегль подзаголовка задан инлайном ──
sub(`<div class="h3" style="font-size:10pt;">`, `<div class="h3">`, 3);
sub(`<div class="h3" style="font-size:10.5pt;">`, `<div class="h3">`, 2);
sub(`<div class="stat" style="padding:2mm;"><div class="stat-value" style="font-size:11pt;">`, `<div class="stat"><div class="stat-value small">`, 3);

// Знак умножения — единица измерения, а не часть числа
sub(`<div class="stat-value">40×</div>`, `<div class="stat-value">40<span class="unit">×</span></div>`);

// ── 10. Разворот «Живое меню»: тематика и текст ──────────────────
// Что было не так. Под каждым блюдом стоял перевод названия —
// «Кебаб из тандыра» под «Tandir kabob», строка словаря. Вводка,
// шаг 2 блока «Как это работает» и тёмная карточка втроём объясняли
// одно и то же: наведите камеру, откроется состав и кнопка. А слово
// «живое» в названии рубрики ничем не подкреплялось — ни июлем, ни
// сезоном, ни людьми за столами.
// Что сделано. Инструкция удалена целиком (в 2026-м никому не надо
// объяснять, как навести камеру на код) — освободившиеся ~20 мм
// отданы содержанию. Каждое блюдо получило одну правдивую деталь:
// чем самаркандский плов отличается от ташкентского, почему кабоб
// из тандыра не пахнет дымом, что значит само слово «ачик-чучук».
// Появился июльский угол: пик томатов и что заказывать в жару.

// Вводка: функцию кода объясняем один раз и сразу с сезонным крючком
sub(
  `      <div class="lang-pair body">
        <div class="uz">Taom yonidagi QR — uning sahifasi: tarkibi, narxi va «kadr olish» tugmasi.</div>
        <div class="ru"><span class="lang-tag">ru</span>QR рядом с блюдом — его страница: состав, цена и кнопка «снять кадр».</div>
      </div>`,
  `      <div class="lang-pair body">
        <div class="uz">Iyulda «Jasmin»da eng ko‘p buyurtma qilinadigan olti taom. Yonidagi kodga telefonni tuting — tarkibi, narxi va o‘z kadringizni olish tugmasi ochiladi.</div>
        <div class="ru"><span class="lang-tag">ru</span>Шесть блюд, которые в июле заказывают чаще всего. Наведите телефон на код рядом с блюдом — откроются состав, цена и кнопка, чтобы снять свой кадр.</div>
      </div>`
);

// Подписи блюд: вместо перевода — деталь, которую гость запомнит
// Одна мысль на строку: пояснение делит высоту с фото (26.5 мм),
// и на двух фразах строка меню вырастала до 38 мм.
const notes = [
  ['Самаркандский плов',
   'Guruch va go‘sht aralashtirilmaydi — qatlab tortiladi. Ikki kishiga yetadi.',
   'Самаркандский плов. Рис и мясо не перемешивают — подают слоями. Хватает на двоих.'],
  ['Кебаб из тандыра',
   'Cho‘g‘da emas, tandir devorida pishadi — tutun hidi yo‘q.',
   'Кебаб из тандыра. Не на углях, а на стенке тандыра — без запаха дыма.'],
  ['Лагман с домашней лапшой',
   'Xamir qo‘lda cho‘ziladi, pichoq tegmaydi.',
   'Лагман. Тесто тянут руками, а не режут ножом.'],
  ['Самса из тандыра',
   'Yog‘da qovurilmaydi, tandir devorida yopiladi. Issig‘ida oling.',
   'Самса из тандыра. Не жарят в масле — печётся на стенке. Берите горячей.'],
  ['Салат к плову',
   'Vazifasi — palov yog‘ini yengillashtirish. Iyulda pomidor eng shirin.',
   'Салат к плову. Его работа — снять с плова тяжесть. В июле томаты самые сладкие.'],
  ['Чай и десерты',
   'Ko‘k choy uch marta qaytariladi. Issiqda sovuqdan yaxshiroq salqinlatadi.',
   'Чай и десерты. Зелёный трижды возвращают в чайник. В жару охлаждает лучше холодного.'],
];
for (const [ru0, uz, ru] of notes) {
  sub(
    `            <div class="caption">${ru0}</div>`,
    `            <div class="lang-pair menu-note">
              <div class="uz">${uz}</div>
              <div class="ru"><span class="lang-tag">ru</span>${ru}</div>
            </div>`
  );
}

// Статистика недели → выбор гостей: та же цифра, но как совет, а не отчёт
sub(
  `        <div class="kicker">Hafta statistikasi · Статистика недели</div>
        <div class="lang-pair body" style="margin-top:1.5mm;">
          <div class="uz">O‘tgan haftada mehmonlar eng ko‘p <b>Samarqandcha palov</b>ni suratga olishdi — 41 kadr.</div>
          <div class="ru"><span class="lang-tag">ru</span>На прошлой неделе гости чаще всего снимали <b>самаркандский плов</b> — 41 кадр.</div>
        </div>`,
  `        <div class="kicker">Mehmonlar tanlovi · Выбор гостей</div>
        <div class="lang-pair body" style="margin-top:1.5mm;">
          <div class="uz">O‘tgan hafta eng ko‘p suratga olingan taom — <b>Samarqandcha palov</b>, 41 kadr. Birinchi marta kelgan bo‘lsangiz, shundan boshlang.</div>
          <div class="ru"><span class="lang-tag">ru</span>Самое снимаемое блюдо прошлой недели — <b>самаркандский плов</b>, 41 кадр. Если пришли впервые — начните с него.</div>
        </div>`
);

// Инструкция «Как это работает» уходит — то же сказано во вводке. На её
// место встаёт блок, ради которого весь номер и существует: связь блюда
// с фермой. Сорта расписаны так же, как на полосах 4 и 8 (горох к плову,
// редис к мясу, брокколи в салат) — номер не должен спорить с собой.
sub(
  `      <div>
        <div class="kicker">Qanday ishlaydi · Как это работает</div>
        <hr class="rule-thin" style="margin:2mm 0;">
        <div class="steps">
          <div class="step"><div class="step-num">1</div><div class="lang-pair body"><div class="uz">Taom yonidagi QR ni telefon kamerasiga tuting.</div><div class="ru"><span class="lang-tag">ru</span>Наведите камеру телефона на QR рядом с блюдом.</div></div></div>
          <div class="step"><div class="step-num">2</div><div class="lang-pair body"><div class="uz">Tarkibi, narxi va «kadr olish» tugmasi ochiladi.</div><div class="ru"><span class="lang-tag">ru</span>Откроются состав, цена и кнопка «снять кадр».</div></div></div>
        </div>
      </div>`,
  `      <div>
        <div class="kicker">Har taomda · В каждом блюде</div>
        <div class="lang-pair body" style="margin-top:1.5mm;">
          <div class="uz">Yashil bezak — o‘sha kuni ertalab fermadan kelgan mikroko‘kat.</div>
          <div class="ru"><span class="lang-tag">ru</span>Зелёный акцент в блюдах — микрозелень, срезанная на ферме этим утром.</div>
        </div>
      </div>`
);

// Тёмная карточка: не третий пересказ кнопки, а связь с «Гостями недели»
sub(
  `        <div class="kicker">Kadr oling · Снимите кадр</div>
        <div class="lang-pair body" style="margin-top:1.5mm;">
          <div class="uz">Taom sahifasida «Kadr olish» tugmasi bor: kamera restoran ramkasi bilan ochiladi va tayyor surat telefoningizda qoladi. Eng yaxshi kadrlar keyingi sonda chop etiladi.</div>
          <div class="ru"><span class="lang-tag">ru</span>На странице блюда есть кнопка «Снять кадр»: камера откроется с фирменной рамкой, готовое фото останется в телефоне. Лучшие кадры печатаем в следующем номере.</div>
        </div>`,
  `        <div class="kicker">Kadringiz jurnalda · Ваш кадр в журнале</div>
        <div class="lang-pair body" style="margin-top:1.5mm;">
          <div class="uz">Tugma kamerani jurnal ramkasi bilan ochadi. Surat sizda qoladi, eng yaxshilari keyingi sonda ism bilan chiqadi — o‘tgan hafta kadrlari 10-betda.</div>
          <div class="ru"><span class="lang-tag">ru</span>Кнопка открывает камеру с рамкой журнала. Фото остаётся у вас, лучшие выходят в следующем номере с именем автора — кадры прошлой недели на стр. 10.</div>
        </div>`
);

// Июльский блок: то, ради чего меню называется живым — сезон и совет
sub(
  `      <div style="display:flex;gap:3mm;align-items:center;">
        <div class="menu-qr" style="width:18mm;">`,
  `      <div>
        <div class="kicker">Iyul issig‘ida · В июльскую жару</div>
        <hr class="rule-thin" style="margin:2mm 0;">
        <div class="lang-pair body">
          <div class="uz">Kunduzi — achchiq-chuchuk va ko‘k choy: issiqni yengil o‘tkazadi. Palovni kechqurun oling, teras salqinlaganda.</div>
          <div class="ru"><span class="lang-tag">ru</span>Днём — ачик-чучук и зелёный чай: с ними жара переносится легче. Плов оставьте на вечер, когда терраса остынет.</div>
        </div>
      </div>

      <div style="display:flex;gap:3mm;align-items:center;">
        <div class="menu-qr" style="width:18mm;">`
);

if (fail.length) {
  console.error('✗ Не применились правки:\n  ' + fail.join('\n  '));
  process.exit(1);
}

await writeFile(HTML, html.replace(/\n/g, '\r\n'), 'utf8');
console.log(`✓ применено правок: ${n}`);
console.log(`  размер: ${(orig.length / 1024 / 1024).toFixed(2)} → ${(html.length / 1024 / 1024).toFixed(2)} МБ`);
const left = [...html.matchAll(/\{\{([A-Z_0-9]+)\}\}/g)].map((m) => m[1]);
if (left.length) console.error('  ⚠ остались плейсхолдеры:', [...new Set(left)].join(', '));
