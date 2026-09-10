import { describe, expect, it } from 'vitest';

import {
  MAX_SIDE,
  MIN_GAIN,
  SKIP_BELOW_BYTES,
  fitSize,
  isGain,
  worthCompressing,
} from './compressPhoto';

// Само сжатие требует canvas и createImageBitmap — их в среде `node` нет.
// Здесь проверяется то, что решает СУДЬБУ кадра: браться ли, до каких
// размеров ужимать и оставлять ли результат. Ошибка в любом из трёх
// решений либо теряет отчёт, либо делает файл тяжелее исходного.

describe('fitSize', () => {
  it('вписывает длинную сторону, сохраняя пропорции', () => {
    const { width, height } = fitSize(4032, 3024);
    expect(width).toBe(MAX_SIDE);
    expect(height).toBe(Math.round((3024 / 4032) * MAX_SIDE));
  });

  it('вертикальный кадр ужимается по высоте', () => {
    const { width, height } = fitSize(3024, 4032);
    expect(height).toBe(MAX_SIDE);
    expect(width).toBeLessThan(MAX_SIDE);
  });

  it('маленький кадр не растягивает', () => {
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('нулевые размеры не делят на ноль', () => {
    expect(fitSize(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe('worthCompressing', () => {
  it('крупный кадр с телефона — берём', () => {
    expect(worthCompressing({ size: 4_000_000, type: 'image/jpeg' })).toBe(true);
  });

  it('HEIC без типа тоже берём — он и весит больше всего', () => {
    expect(worthCompressing({ size: 5_000_000, type: '' })).toBe(true);
  });

  it('мелкий файл не трогаем — выигрыша не будет', () => {
    expect(worthCompressing({ size: SKIP_BELOW_BYTES - 1, type: 'image/jpeg' })).toBe(false);
  });

  it('не картинку не трогаем', () => {
    expect(worthCompressing({ size: 9_000_000, type: 'application/pdf' })).toBe(false);
  });
});

describe('isGain', () => {
  it('впятеро легче — оставляем сжатое', () => {
    expect(isGain(5_000_000, 200_000)).toBe(true);
  });

  it('стало тяжелее — отдаём оригинал', () => {
    // HEIC браузер разворачивает в JPEG и может СДЕЛАТЬ ХУЖЕ. Отдать такой
    // результат значит навредить ровно там, где хотели помочь.
    expect(isGain(2_000_000, 3_000_000)).toBe(false);
  });

  it('выигрыш меньше порога не считается выигрышем', () => {
    expect(isGain(1_000_000, Math.round(1_000_000 / (MIN_GAIN - 0.01)))).toBe(false);
  });

  it('пустой результат не выдаётся за сжатие', () => {
    expect(isGain(1_000_000, 0)).toBe(false);
  });
});
