import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ══════════════════════════════════════════════════════════════════════
// Целостность воркера MapLibre.
//
// СЛУЧАЙ, РАДИ КОТОРОГО ЭТОТ ТЕСТ НАПИСАН
//
// 18.08.2026 карта на бою показывала ровный чёрный прямоугольник. Всё
// зелёное: сборка, типы, юнит-тесты, линтер, CI, даже Playwright. Сломан
// был воркер, который разбирает векторные тайлы: Turbopack вынес его в
// static/media/ с хешем в имени, а его спутника maplibre-gl-shared.mjs —
// с ДРУГИМ хешем, тогда как воркер импортирует спутника относительным
// путём без хеша. Импорт ушёл в 404, тайлы никто не разобрал, и карта
// нарисовала только фоновый слой стиля.
//
// Проверяем ровно то расхождение, которое случилось: имя, которое воркер
// импортирует, обязано совпадать с именем файла, реально лежащего рядом.
//
// Копирование запускаем сами, а не полагаемся на prebuild: задача CI
// «Lint & TypeCheck» зовёт `npx vitest run` напрямую, минуя npm-скрипты,
// и без этого тест падал бы на пустом каталоге, а не на настоящей
// поломке. Что файлы доезжают до браузера через реальную сборку —
// проверяет e2e/map.spec.ts, там своя ответственность.
// ══════════════════════════════════════════════════════════════════════

const PUBLIC_DIR = join(process.cwd(), 'public', 'maplibre');
const WORKER = 'maplibre-gl-worker.mjs';

beforeAll(() => {
  // Идемпотентно и быстро; падает с внятной ошибкой, если dist изменился.
  execFileSync('node', ['scripts/copy-maplibre-worker.mjs'], { stdio: 'pipe' });
});

describe('воркер MapLibre собирается комплектно', () => {
  it('сам воркер на месте', () => {
    expect(existsSync(join(PUBLIC_DIR, WORKER))).toBe(true);
  });

  it('всё, что воркер импортирует, лежит рядом с ним', () => {
    // Это и есть та самая проверка. Воркер тянет спутника относительным
    // путём, поэтому «рядом» — не фигура речи, а требование браузера.
    const source = readFileSync(join(PUBLIC_DIR, WORKER), 'utf8');
    const imports = [...source.matchAll(/from\s*["']\.\/([^"']+)["']/g)].map((m) => m[1]);

    // Импортов нет вовсе — значит MapLibre сменил состав поставки, и тест
    // перестал проверять то, ради чего написан.
    expect(imports.length, 'воркер перестал импортировать спутников — проверьте dist')
      .toBeGreaterThan(0);

    for (const name of imports) {
      expect(existsSync(join(PUBLIC_DIR, name)), `${name} не лежит рядом с воркером`)
        .toBe(true);
    }
  });

  it('имена без хешей — иначе setWorkerUrl промахнётся', () => {
    // Turbopack именует ассеты как `maplibre-gl-worker.2lrbw1xs5ci84.mjs`.
    // Такой файл здесь означает, что копирование подменили сборкой, и
    // адрес в worker.ts снова разойдётся с реальностью.
    for (const name of readdirSync(PUBLIC_DIR)) {
      expect(name, `${name} похоже на собранный ассет с хешем`)
        .toMatch(/^maplibre-gl-(worker|shared)\.mjs$/);
    }
  });
});
