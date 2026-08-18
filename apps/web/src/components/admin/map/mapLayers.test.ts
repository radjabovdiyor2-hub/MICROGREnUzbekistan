import { describe, it, expect } from 'vitest';

import { COLORIZE_MODES } from './mapFeature';
import {
  buildLayers,
  clusterColor,
  clusterSourceOptions,
  pointColor,
  pointStrokeColor,
  styleUrl,
} from './mapLayers';
import type { TokenColors } from './useTokenColors';

// ══════════════════════════════════════════════════════════════════════
// Слои карты.
//
// Один тест ловит две противоположные ошибки. `var(--success)` в paint —
// MapLibre такого не понимает и рисует чёрное; hex прямо в выражении —
// цвет перестал следовать за темой и мимо дизайн-системы. Верно только
// третье: цвет приходит параметром.
// ══════════════════════════════════════════════════════════════════════

/** Палитра-маячок: каждое значение узнаваемо в выводе. */
const COLORS: TokenColors = {
  success: '#111111',
  warning: '#222222',
  error: '#333333',
  info: '#444444',
  muted: '#555555',
  slipping: '#666666',
  accent: '#777777',
  brand: '#888888',
  card: '#999999',
  border: '#aaaaaa',
  text: '#bbbbbb',
  rampLow: '#cccccc',
  rampMid: '#dddddd',
  rampHigh: '#eeeeee',
};

const PALETTE = new Set(Object.values(COLORS));

/** Все строки внутри выражения любой вложенности. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('paint-выражения не знают ни CSS-переменных, ни своих цветов', () => {
  for (const mode of COLORIZE_MODES) {
    it(`режим «${mode}»: цвета только из переданной палитры`, () => {
      const layers = buildLayers(mode, COLORS, 1_000_000);
      const found = strings(layers).filter((s) => /^#|^rgb|^hsl/.test(s));

      expect(found.length).toBeGreaterThan(0);
      for (const color of found) {
        expect(PALETTE.has(color), `цвет ${color} задан мимо палитры`).toBe(true);
      }
    });

    it(`режим «${mode}»: ни одной CSS-переменной`, () => {
      const layers = buildLayers(mode, COLORS, 1_000_000);
      for (const s of strings(layers)) {
        expect(s).not.toMatch(/var\(--/);
      }
    });
  }
});

describe('раскраска точек', () => {
  it('по состоянию использует match, а не порядок значений', () => {
    const expr = pointColor('state', COLORS, 0) as unknown[];
    expect(expr[0]).toBe('match');
    expect(expr).toContain(COLORS.error); // lost
    expect(expr).toContain(COLORS.success); // healthy
  });

  it('по выручке строит непрерывную шкалу и переживает нулевой p80', () => {
    const expr = pointColor('revenue', COLORS, 0) as unknown[];
    expect(expr[0]).toBe('interpolate');
    // Ступени interpolate обязаны возрастать: 0 → 0 → 0 уронил бы MapLibre.
    const stops = expr.slice(3).filter((_, i) => i % 2 === 0) as number[];
    for (let i = 1; i < stops.length; i += 1) {
      expect(stops[i]).toBeGreaterThan(stops[i - 1]);
    }
  });

  it('ручной пин обведён акцентом — видно проверенную человеком точку', () => {
    const expr = pointStrokeColor(COLORS);
    // Значения лежат внутри вложенного ['==', ['get','gs'], 'manual'],
    // поэтому ищем по всему выражению, а не на верхнем уровне.
    expect(strings(expr)).toContain('manual');
    expect(strings(expr)).toContain(COLORS.accent);
  });
});

describe('кластеры', () => {
  it('агрегируют долю проблемных и сумму — иначе красить нечем', () => {
    const props = clusterSourceOptions().clusterProperties;
    expect(props.sumSpent).toBeDefined();
    expect(props.atRisk).toBeDefined();
    expect(JSON.stringify(props.atRisk)).toContain('at_risk');
    expect(JSON.stringify(props.atRisk)).toContain('lost');
  });

  it('красятся по доле проблемных, а не по количеству точек', () => {
    const expr = JSON.stringify(clusterColor(COLORS));
    expect(expr).toContain('atRisk');
    // max(...,1) страхует от деления на ноль в пустом кластере.
    expect(expr).toContain('max');
  });
});

describe('styleUrl', () => {
  it('тёмная тема получает тёмную подложку', () => {
    expect(styleUrl('dark')).toMatch(/\/styles\/dark$/);
    expect(styleUrl('light')).toMatch(/\/styles\/positron$/);
  });

  it('не сдваивает слеш при адресе с хвостовым слешем', () => {
    const original = process.env.NEXT_PUBLIC_MAP_TILES_URL;
    process.env.NEXT_PUBLIC_MAP_TILES_URL = 'https://tiles.example.com/';
    expect(styleUrl('light')).toBe('https://tiles.example.com/styles/positron');
    process.env.NEXT_PUBLIC_MAP_TILES_URL = original;
  });
});
