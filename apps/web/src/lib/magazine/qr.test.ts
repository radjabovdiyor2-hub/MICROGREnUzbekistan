import { describe, it, expect } from 'vitest';
import { qrPng, qrSvg, dishUrl, menuUrl } from './qr';

// canvas npm package is required for PNG rendering but may not be
// available in CI (native dependency). Skip PNG tests gracefully.
let hasCanvas = false;
try { require.resolve('canvas'); hasCanvas = true; } catch {}

describe('magazine/qr · печатные QR', () => {
  it('qrSvg возвращает валидный SVG', async () => {
    const svg = await qrSvg(dishUrl('non-kabob', 3));
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it.skipIf(!hasCanvas)('qrPng возвращает PNG-буфер с корректной сигнатурой', async () => {
    const buf = await qrPng(menuUrl('non-kabob'), 256);
    expect(buf.length).toBeGreaterThan(0);
    // \x89PNG — магическая сигнатура PNG
    expect(buf[0]).toBe(0x89);
    expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  });

  it.skipIf(!hasCanvas)('размер PNG растёт вместе с запрошенной шириной', async () => {
    const small = await qrPng(menuUrl('x'), 128);
    const large = await qrPng(menuUrl('x'), 1024);
    expect(large.length).toBeGreaterThan(small.length);
  });

  it('URL блюда и меню короткие и предсказуемые', () => {
    expect(dishUrl('non-kabob', 3)).toMatch(/\/m\/non-kabob\/d\/3$/);
    expect(menuUrl('non-kabob')).toMatch(/\/m\/non-kabob$/);
  });
});
