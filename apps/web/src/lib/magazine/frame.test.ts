import { describe, it, expect } from 'vitest';
import { coverRect, frameLayout, instagramHandle, FRAME_W, FRAME_H } from './frame';

describe('magazine/frame · coverRect', () => {
  const ratio = FRAME_W / FRAME_H;

  it('широкий кадр обрезается по бокам, высота сохраняется', () => {
    const r = coverRect(1920, 1080);
    expect(r.h).toBe(1080);
    expect(r.w).toBeCloseTo(1080 * ratio, 5);
    // симметрично по центру — иначе блюдо уезжает из кадра
    expect(r.x).toBeCloseTo((1920 - r.w) / 2, 5);
    expect(r.y).toBe(0);
  });

  it('высокий кадр обрезается сверху и снизу', () => {
    const r = coverRect(1080, 2400);
    expect(r.w).toBe(1080);
    expect(r.h).toBeCloseTo(1080 / ratio, 5);
    expect(r.y).toBeCloseTo((2400 - r.h) / 2, 5);
  });

  it('кадр ровно 9:16 не обрезается', () => {
    const r = coverRect(FRAME_W, FRAME_H);
    expect(r).toEqual({ x: 0, y: 0, w: FRAME_W, h: FRAME_H });
  });

  it('пропорции результата всегда 9:16', () => {
    for (const [w, h] of [[4032, 3024], [3024, 4032], [1280, 720], [640, 480]]) {
      const r = coverRect(w, h);
      expect(r.w / r.h).toBeCloseTo(ratio, 4);
      // область обрезки не может вылезти за пределы исходника
      expect(r.x + r.w).toBeLessThanOrEqual(w + 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(h + 1e-6);
    }
  });

  it('не падает на нулевом размере (камера ещё не отдала кадр)', () => {
    expect(coverRect(0, 0)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe('magazine/frame · frameLayout', () => {
  it('шапка и подвал не перекрываются', () => {
    const l = frameLayout(1920, 1080);
    expect(l.header.y + l.header.h).toBeLessThan(l.footer.y);
  });

  it('акцентная полоса прижата к нижнему краю', () => {
    const l = frameLayout(1080, 1920);
    expect(l.accentBar.y + l.accentBar.h).toBe(FRAME_H);
    expect(l.accentBar.w).toBe(FRAME_W);
  });

  it('логотип внутри шапки', () => {
    const l = frameLayout(1080, 1920);
    expect(l.logo.y + l.logo.h).toBeLessThanOrEqual(l.header.h);
  });
});

describe('magazine/frame · instagramHandle', () => {
  it('нормализует ввод владельца', () => {
    expect(instagramHandle('nonkabob')).toBe('@nonkabob');
    expect(instagramHandle('@nonkabob')).toBe('@nonkabob');
    expect(instagramHandle('  @nonkabob  ')).toBe('@nonkabob');
  });

  it('пустое значение не превращается в «@»', () => {
    expect(instagramHandle('')).toBeNull();
    expect(instagramHandle(null)).toBeNull();
    expect(instagramHandle('@')).toBeNull();
  });
});
