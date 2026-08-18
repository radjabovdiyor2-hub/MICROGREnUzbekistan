import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ══════════════════════════════════════════════════════════════════════
// Целостность воркера MapLibre.
//
// СЛУЧАЙ, РАДИ КОТОРОГО ЭТОТ ТЕСТ НАПИСАН
//
// 18.08.2026 карта на бою показывала ровный чёрный прямоугольник. Всё
// зелёное: сборка, юнит-тесты, линтер, CI, даже Playwright. Сломан был
// воркер, который разбирает векторные тайлы: Turbopack вынес его в
// static/media/ с хешем в имени, а его спутника maplibre-gl-shared.mjs —
// с ДРУГИМ хешем, тогда как воркер импортирует спутника относительным
// путём без хеша. Импорт ушёл в 404, тайлы никто не разобрал, и карта
// нарисовала только фоновый слой стиля.
//
// Ни одна существующая проверка этого увидеть не могла: с точки зрения
// сборки и типов всё в порядке, а «карта чёрная» — свойство рантайма.
//
// Поэтому проверяем ровно то расхождение, которое и случилось: имя,
// которое воркер импортирует, обязано совпадать с именем файла, реально
// лежащего рядом с ним в public/.
// ══════════════════════════════════════════════════════════════════════

/** Тот же каталог, куда кладёт scripts/copy-maplibre-worker.mjs. */
const PUBLIC_DIR = join(process.cwd(), 'public', 'maplibre');
const WORKER = 'maplibre-gl-worker.mjs';

const hint =
  'Запустите `node scripts/copy-maplibre-worker.mjs` в apps/web — ' +
  'обычно это делает prebuild.';

describe('воркер MapLibre лежит в public/', () => {
  it('сам воркер на месте', () => {
    expect(existsSync(join(PUBLIC_DIR, WORKER)), hint).toBe(true);
  });

  it('всё, что воркер импортирует, лежит рядом с ним', () => {
    // Это и есть та самая проверка. Воркер тянет спутника относительным
    // путём, поэтому «рядом» — не фигура речи, а требование браузера.
    const source = readFileSync(join(PUBLIC_DIR, WORKER), 'utf8');
    const imports = [...source.matchAll(/from\s*["']\.\/([^"']+)["']/g)].map((m) => m[1]);

    // Если импортов нет вовсе — значит MapLibre сменил состав поставки, и
    // тест перестал проверять то, ради чего написан.
    expect(imports.length, 'воркер перестал импортировать спутников — проверьте dist').
      toBeGreaterThan(0);

    for (const name of imports) {
      expect(existsSync(join(PUBLIC_DIR, name)), `${name} не лежит рядом с воркером. ${hint}`)
        .toBe(true);
    }
  });

  it('имена без хешей — иначе setWorkerUrl промахнётся', () => {
    // Turbopack именует ассеты как `maplibre-gl-worker.2lrbw1xs5ci84.mjs`.
    // Попадание такого файла сюда означает, что копирование подменили
    // сборкой, и адрес в worker.ts снова разойдётся с реальностью.
    for (const name of readdirSync(PUBLIC_DIR)) {
      expect(name, `${name} похоже на собранный ассет с хешем`).toMatch(
        /^maplibre-gl-(worker|shared)\.mjs$/,
      );
    }
  });
});
