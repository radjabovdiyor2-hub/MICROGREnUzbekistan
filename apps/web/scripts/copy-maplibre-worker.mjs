import { copyFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// ══════════════════════════════════════════════════════════════════════
// Кладёт воркер MapLibre в public/, минуя бандлер.
//
// ЗАЧЕМ. MapLibre разбирает векторные тайлы в Web Worker, и воркер — это
// ДВА файла: maplibre-gl-worker.mjs импортирует maplibre-gl-shared.mjs
// относительным путём `./maplibre-gl-shared.mjs`.
//
// Turbopack выносит оба в static/media/ и приписывает им хеши:
//   maplibre-gl-worker.2lrbw1xs5ci84.mjs   ← внутри: import "./maplibre-gl-shared.mjs"
//   maplibre-gl-shared.0ykqf5qbi-83b.mjs   ← файла без хеша рядом НЕТ
// Импорт уходит в 404, воркер умирает, тайлы никто не разбирает — и карта
// показывает только фоновый слой стиля. В тёмной теме это ровный чёрный
// прямоугольник, неотличимый от «карта не подключена».
//
// Переписать URL воркера бандлер не может, поэтому файлы отдаются из
// public/ по стабильным именам, а адрес сообщается через setWorkerUrl()
// (см. src/lib/map/worker.ts).
//
// Копируем, а не коммитим: вендорные файлы иначе разъедутся с установленной
// версией при обновлении maplibre-gl, и мы получим ту же чёрную карту, но
// уже от несовпадения протокола между главным потоком и воркером.
// ══════════════════════════════════════════════════════════════════════

const require = createRequire(import.meta.url);

/** Оба файла обязательны и обязаны лежать В ОДНОМ каталоге. */
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

const TARGET_DIR = join(process.cwd(), 'public', 'maplibre');

function distDir() {
  try {
    // Резолвим через package.json пакета, а не через его точку входа:
    // exports у maplibre-gl не отдаёт dist-файлы напрямую.
    return join(dirname(require.resolve('maplibre-gl/package.json')), 'dist');
  } catch {
    throw new Error(
      'maplibre-gl не установлен. Запустите npm install перед сборкой.',
    );
  }
}

function main() {
  const from = distDir();

  for (const name of FILES) {
    const source = join(from, name);
    if (!existsSync(source)) {
      // Молча собраться с неполным public/ нельзя: это ровно та поломка,
      // которую скрипт и чинит. Пусть падает здесь, а не на бою.
      throw new Error(
        `Не найден ${name} в ${from}. ` +
          'Похоже, maplibre-gl сменил состав dist — проверьте, чем теперь ' +
          'поставляется воркер, и поправьте список FILES.',
      );
    }
  }

  // Имя, которое воркер импортирует, обязано совпасть с тем, что мы кладём
  // рядом. Разошлись — и карта снова почернеет, поэтому сверяем на месте.
  const workerSource = readFileSync(join(from, FILES[0]), 'utf8');
  const imported = workerSource.match(/from\s*["']\.\/([^"']+)["']/);
  if (imported && !FILES.includes(imported[1])) {
    throw new Error(
      `Воркер импортирует "./${imported[1]}", а мы копируем только ${FILES.join(', ')}. ` +
        'Добавьте недостающий файл в FILES, иначе воркер не запустится.',
    );
  }

  mkdirSync(TARGET_DIR, { recursive: true });
  for (const name of FILES) {
    copyFileSync(join(from, name), join(TARGET_DIR, name));
  }

  console.log(`maplibre: воркер и его зависимость скопированы в public/maplibre/`);
}

main();
