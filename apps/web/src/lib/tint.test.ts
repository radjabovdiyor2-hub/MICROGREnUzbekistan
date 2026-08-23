import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { tint } from './tint';

// ══════════════════════════════════════════════════════════════════════
// Подложка плашки и запрет на приём, который её ломал.
//
// Одиннадцать плашек в админке рисовались БЕЗ ФОНА: подложка задавалась
// склейкой `${st.color}15`, а все цвета статусов — токены `var(--…)`.
// `var(--success)15` — невалидное объявление, браузер отбрасывает его
// молча. Заметить это глазами почти нельзя: цвет текста рядом взят из
// того же токена и работает, поэтому плашка выглядела бледной, а не
// сломанной.
//
// Первый тест проверяет саму функцию, второй — что приём не вернулся.
// ══════════════════════════════════════════════════════════════════════

describe('подложка плашки', () => {
  it('работает с токеном, а не только с литералом', () => {
    expect(tint('var(--success)')).toBe('color-mix(in srgb, var(--success) 14%, transparent)');
  });

  it('доля задаётся явно, когда нужна другая', () => {
    expect(tint('var(--error)', 28)).toContain('28%');
  });

  it('литеральный цвет тоже проходит', () => {
    expect(tint('#22C55E')).toBe('color-mix(in srgb, #22C55E 14%, transparent)');
  });
});

/** Исходники под каталогом — рекурсивно, `.ts` и `.tsx`. */
function sourceFiles(...segments: string[]): string[] {
  const root = join(process.cwd(), 'src', ...segments);
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) out.push(path);
    }
  };
  walk(root);
  return out;
}

/** `${что-нибудь}` + две шестнадцатеричные цифры внутри шаблонной строки. */
const BROKEN = /\$\{[^}]+\}[0-9A-Fa-f]{2}`/;

describe('склейка альфы к цвету', () => {
  it('сторож узнаёт сломанный приём', () => {
    // Без этой проверки предыдущий тест был бы зелёным даже с негодным
    // выражением — то есть не проверял бы ничего.
    expect(BROKEN.test('background: `${st.color}15`')).toBe(true);
    expect(BROKEN.test('background: tint(st.color)')).toBe(false);
  });

  it('в админке её больше нет', () => {
    const guilty = sourceFiles('components', 'admin').filter((path) =>
      BROKEN.test(readFileSync(path, 'utf8')),
    );

    expect(
      guilty.map((p) => p.split(/[\/]/).slice(-2).join('/')),
      'подложка склеена с альфой: с токеном var(--…) это невалидный CSS, нужен tint()',
    ).toEqual([]);
  });

  it('на витрине её тоже нет', () => {
    // Сторож смотрел ТОЛЬКО в админку, поэтому ровно та же ошибка спокойно
    // жила на клиентских экранах: девятнадцать объявлений в девяти файлах —
    // фон плашек рецепта, рамки калькуляторов, тень карточки дня. Все они
    // не рисовались вовсе.
    //
    // `components/ui` исключён: там `${pullY * 2}deg` — «de» тоже читается
    // как шестнадцатеричное число, и слепая замена ломала поворот стрелки.
    // Это же и повод держать проверку узкой: она про ЦВЕТ, а не про любую
    // склейку.
    const guilty = [
      ...sourceFiles('app'),
      ...sourceFiles('components', 'home'),
      ...sourceFiles('components', 'shop'),
      ...sourceFiles('components', 'ai'),
      ...sourceFiles('components', 'recipe'),
      ...sourceFiles('components', 'menu'),
      ...sourceFiles('components', 'magazine'),
    ].filter((path) => BROKEN.test(readFileSync(path, 'utf8')));

    expect(
      guilty.map((p) => p.split(/[\/]/).slice(-2).join('/')),
      'подложка склеена с альфой: с токеном var(--…) это невалидный CSS, нужен tint()',
    ).toEqual([]);
  });
});
