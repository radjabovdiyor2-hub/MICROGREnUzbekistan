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

// ══════════════════════════════════════════════════════════════════════
// Второй случай той же черноты — 09.09.2026, экран «День в поле».
//
// Адрес воркера выставляется ПОБОЧНЫМ ЭФФЕКТОМ модуля `@/lib/map/worker`,
// то есть только у того, кто его импортировал. Импортировали его карта
// клиентов и витринная; новая карта дня — нет. На её вкладке ни одной из
// двух старых карт нет, адрес оставался невыставленным, MapLibre считал
// его от `import.meta.url` и получал 404.
//
// Поломка тихая до неприличия: стиль, спрайты и TileJSON приходят главным
// потоком и отвечают 200, растровый слой даже загружается — а векторных
// тайлов и шрифтов нет, потому что их тянет мёртвый воркер. Ни ошибки, ни
// исключения, ни красного в CI. Отличить от «карта не подключена» нельзя.
//
// Поэтому правило проверяется механически: кто строит карту — тот
// импортирует адрес воркера. Третьей такой карты быть не должно.
// ══════════════════════════════════════════════════════════════════════

describe('каждая карта задаёт адрес воркера', () => {
  const SRC = join(process.cwd(), 'src');

  /** Все .ts/.tsx под src — рекурсивно, без node_modules. */
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sources(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
  }

  /** Псевдоним, под которым файл ввёз конструктор карты. */
  function mapAlias(source: string): string | null {
    const block = source.match(/import\s*\{([\s\S]*?)\}\s*from\s*['"]maplibre-gl['"]/);
    if (!block) return null;
    const named = block[1].match(/\bMap\s+as\s+(\w+)/);
    if (named) return named[1];
    return /\bMap\b\s*(?:,|\})/.test(block[1]) ? 'Map' : null;
  }

  const builders = sources(SRC)
    .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
    .filter(({ source }) => {
      const alias = mapAlias(source);
      return alias !== null && new RegExp(String.raw`new\s+${alias}\s*\(`).test(source);
    });

  it('карты вообще находятся — иначе проверка проверяет пустоту', () => {
    // Переименовали импорт или перешли на другую библиотеку — тест обязан
    // упасть здесь, а не тихо стать зелёной пустышкой.
    expect(builders.length, 'ни одного конструктора карты не найдено').toBeGreaterThan(0);
  });

  it.each(builders.map(({ file }) => file))('%s импортирует @/lib/map/worker', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(
      /import\s+['"]@\/lib\/map\/worker['"]/.test(source),
      'без этого импорта векторные тайлы не разберёт никто, и карта будет чёрной',
    ).toBe(true);
  });
});
