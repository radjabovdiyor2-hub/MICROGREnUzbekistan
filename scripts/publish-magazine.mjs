// ════════════════════════════════════════════════════════════
// Публикация номера в apps/web/public/magazine.
//   node scripts/publish-magazine.mjs [--src=<html>] [--slug=<имя>]
//
// ПОЧЕМУ ЭТО НЕ КОПИРОВАНИЕ ФАЙЛА
// В исходнике пути относительные и считаются от content/generated:
//   ../../apps/web/public/catalog/noxat_micro.png
//   ../templates/fonts/fonts-subset.css
//   img/recipe.png
// Из public/magazine ни один из них не разрешается — страница откроется
// без фотографий и со системной подменой шрифтов. Поэтому пути
// переписываются, а локальные ассеты складываются в <slug>/ рядом.
//
// PDF собирается тем же scripts/magazine-pdf.mjs и копируется как есть.
//
// HTML НЕ ЗАГРУЖАЕТСЯ ЧЕРЕЗ АДМИНКУ
// /api/upload намеренно отвергает .html и .htm: файлы отдаются с того же
// origin по /uploads/, и загруженная страница выполняла бы свой JavaScript
// на домене магазина (см. комментарий в apps/web/src/app/api/upload/route.ts).
// Номер живёт в репозитории — так же лежат выпуски 01 и 02. Через админку
// грузится только PDF.
// ════════════════════════════════════════════════════════════
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const SRC = resolve(ROOT, arg('src', 'content/generated/shakar-01-print.html'));
const SLUG = arg('slug', 'shakar-01');
const PUB = join(ROOT, 'apps', 'web', 'public', 'magazine');
const ASSETS = join(PUB, SLUG);

await mkdir(ASSETS, { recursive: true });

let html = await readFile(SRC, 'utf8');
const srcDir = dirname(SRC);
const copied = [];

// Ассеты, лежащие рядом с исходником (img/, *.jpeg, qr-*.png) → <slug>/
// ПУТИ ОТНОСИТЕЛЬНЫЕ, А НЕ АБСОЛЮТНЫЕ
// Абсолютный /catalog/… разрешается только когда страницу отдаёт сервер.
// Открытый двойным щелчком файл ведёт такой путь в корень диска (D:/catalog/…),
// и номер показывается голым текстом без стилей и фотографий. Относительный
// ../catalog/… работает в обоих случаях: и по http от /magazine/, и по file://.
// Владелец проверяет номер именно двойным щелчком — это и есть рабочий сценарий.
async function localize(relPath) {
  const from = resolve(srcDir, relPath);
  const name = basename(relPath);
  await copyFile(from, join(ASSETS, name));
  copied.push(name);
  return `${SLUG}/${name}`;
}

// 1. Фото каталога лежат на уровень выше — public/catalog/
html = html.replace(/\.\.\/\.\.\/apps\/web\/public\//g, '../');

// 2. Шрифты: подмножество base64 кладём рядом, иначе номер откроется
//    системной гарнитурой и поедет вся раскладка.
await copyFile(join(ROOT, 'content/templates/fonts/fonts-subset.css'), join(ASSETS, 'fonts-subset.css'));
copied.push('fonts-subset.css');
html = html.replace('../templates/fonts/fonts-subset.css', `${SLUG}/fonts-subset.css`);

// 3. Печатный дизайн-слой
await copyFile(join(ROOT, 'content/templates/fresh-weekly-a5.design.css'), join(ASSETS, 'design.css'));
copied.push('design.css');
html = html.replace('../templates/fresh-weekly-a5.design.css', `${SLUG}/design.css`);

// 4. Всё остальное локальное: src="img/..." , src="plov-....jpeg", src="qr-....png"
//    ../ отсекаем: после шага 1 так выглядят фото каталога, они уже лежат в
//    public/ и копировать их к номеру не нужно — иначе скрипт ищет их
//    относительно content/ и падает на несуществующем пути.
const localRefs = [...html.matchAll(/src="(?!https?:|\/|data:|\.\.\/)([^"]+)"/g)].map((m) => m[1]);
for (const rel of new Set(localRefs)) {
  const url = await localize(rel);
  html = html.replaceAll(`src="${rel}"`, `src="${url}"`);
}

// 5. Направляющие реза — только для типографского пруфа, на сайте они мусор
html = html.replace(/<div class="trim-guide"><\/div>\s*/g, '');

const outHtml = join(PUB, `${SLUG}.html`);
await writeFile(outHtml, html, 'utf8');

// 6. PDF рядом, если собран
const srcPdf = SRC.replace(/\.html$/, '.pdf');
let pdfNote = 'PDF не найден — сначала node scripts/magazine-pdf.mjs';
try {
  await stat(srcPdf);
  const outPdf = join(PUB, `${SLUG}.pdf`);
  await copyFile(srcPdf, outPdf);
  const { size } = await stat(outPdf);
  pdfNote = `/magazine/${SLUG}.pdf · ${(size / 1024 / 1024).toFixed(1)} МБ`;
} catch { /* PDF ещё не собран — не повод падать */ }

console.log(`✓ /magazine/${SLUG}.html`);
console.log(`✓ ${pdfNote}`);
console.log(`  ассетов рядом: ${copied.length} (${copied.join(', ')})`);
console.log('\nОсталось вручную: в админке привязать PDF к записи Restaurant');
console.log('«Microgreen Uzbekistan» (isMagazinePartner = true) — тогда номер');
console.log('встанет карточкой в блок загруженных на /magazine.');
