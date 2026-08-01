// ════════════════════════════════════════════════════════════
// Композитор кадра гостя: снимок с камеры → готовая сторис 1080×1920.
//
// Смысл механики: гость не постит своё фото еды не потому, что не хочет,
// а потому что кадр выходит тусклым и возиться лень. Мы отдаём ему готовый
// кадр в фирменной рамке ресторана за пять секунд.
//
// Геометрия вынесена в чистые функции: рисование живёт только в браузере,
// а раскладку можно проверить тестом.
// ════════════════════════════════════════════════════════════

import { token} from '@/lib/canvasTokens';

export const FRAME_W = 1080;
export const FRAME_H = 1920;

export interface FrameBrand {
  name: string;
  logo?: string | null;
  instagram?: string | null;
  brandPrimary?: string | null;
  brandAccent?: string | null;
  promoCode?: string | null;
  promoDiscount?: number | null;
}

export interface FrameContent {
  dishName: string;
  dishNameUz?: string | null;
  price?: string | null;
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface FrameLayout {
  /** Какую часть исходного кадра берём, чтобы заполнить 9:16 без искажений. */
  source: Rect;
  header: Rect;
  footer: Rect;
  accentBar: Rect;
  logo: Rect;
}


/**
 * Обрезка «по большей стороне» (object-fit: cover): кадр телефона почти
 * никогда не 9:16, и без обрезки лицо блюда либо сплющится, либо уедет.
 */
export function coverRect(srcW: number, srcH: number, dstW = FRAME_W, dstH = FRAME_H): Rect {
  if (srcW <= 0 || srcH <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (srcRatio > dstRatio) {
    const w = srcH * dstRatio;
    return { x: (srcW - w) / 2, y: 0, w, h: srcH };
  }
  const h = srcW / dstRatio;
  return { x: 0, y: (srcH - h) / 2, w: srcW, h };
}

export function frameLayout(srcW: number, srcH: number): FrameLayout {
  return {
    source: coverRect(srcW, srcH),
    header: { x: 0, y: 0, w: FRAME_W, h: 240 },
    footer: { x: 0, y: FRAME_H - 560, w: FRAME_W, h: 560 },
    accentBar: { x: 0, y: FRAME_H - 24, w: FRAME_W, h: 24 },
    logo: { x: 64, y: 64, w: 112, h: 112 },
  };
}

export function instagramHandle(raw?: string | null): string | null {
  if (!raw) return null;
  const h = raw.trim().replace(/^@/, '');
  return h ? `@${h}` : null;
}

type Ctx = CanvasRenderingContext2D;

function roundedRect(ctx: Ctx, r: Rect, radius: number) {
  ctx.beginPath();
  ctx.moveTo(r.x + radius, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, radius);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, radius);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, radius);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, radius);
  ctx.closePath();
}

/** Ужимает строку до нужной ширины, чтобы длинное название не уехало за край. */
function fitText(ctx: Ctx, text: string, maxWidth: number, startSize: number, font: string): number {
  let size = startSize;
  ctx.font = `${size}px ${font}`;
  while (ctx.measureText(text).width > maxWidth && size > 28) {
    size -= 4;
    ctx.font = `${size}px ${font}`;
  }
  return size;
}

export { drawFrame } from './frameDrawer';
