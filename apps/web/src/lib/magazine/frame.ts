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

const DEFAULT_ACCENT = '#10B981';
const DEFAULT_GOLD = '#C9A84C';

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

/**
 * Рисует финальный кадр. Вызывается только в браузере.
 * `source` — видео или картинка со снимком.
 */
export function drawFrame(
  ctx: Ctx,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  brand: FrameBrand,
  content: FrameContent,
  logoImage?: CanvasImageSource | null,
): void {
  const layout = frameLayout(srcW, srcH);
  const accent = brand.brandPrimary || DEFAULT_ACCENT;
  const gold = brand.brandAccent || DEFAULT_GOLD;

  ctx.clearRect(0, 0, FRAME_W, FRAME_H);

  // Снимок на всю площадь. Лёгкая коррекция — в зале вечером темно,
  // и без неё кадр выходит именно таким, каким гость его не выложит.
  ctx.save();
  ctx.filter = 'brightness(1.08) contrast(1.06) saturate(1.12)';
  const s = layout.source;
  ctx.drawImage(source, s.x, s.y, s.w, s.h, 0, 0, FRAME_W, FRAME_H);
  ctx.restore();

  // Затемнения сверху и снизу, чтобы текст читался на любом фоне
  const top = ctx.createLinearGradient(0, 0, 0, layout.header.h);
  top.addColorStop(0, 'rgba(0,0,0,0.65)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, FRAME_W, layout.header.h);

  const bottom = ctx.createLinearGradient(0, layout.footer.y, 0, FRAME_H);
  bottom.addColorStop(0, 'rgba(0,0,0,0)');
  bottom.addColorStop(0.45, 'rgba(0,0,0,0.72)');
  bottom.addColorStop(1, 'rgba(0,0,0,0.92)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, layout.footer.y, FRAME_W, layout.footer.h);

  // ── Шапка: логотип и название заведения ──
  let textX = 64;
  if (logoImage) {
    ctx.save();
    roundedRect(ctx, layout.logo, 28);
    ctx.clip();
    ctx.drawImage(logoImage, layout.logo.x, layout.logo.y, layout.logo.w, layout.logo.h);
    ctx.restore();
    textX = layout.logo.x + layout.logo.w + 24;
  }
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.font = '700 44px Inter, system-ui, sans-serif';
  ctx.fillText(brand.name, textX, layout.logo.y + 46);
  const handle = instagramHandle(brand.instagram);
  if (handle) {
    ctx.fillStyle = gold;
    ctx.font = '500 32px Inter, system-ui, sans-serif';
    ctx.fillText(handle, textX, layout.logo.y + 96);
  }

  // ── Подвал: блюдо, цена, промокод ──
  const padX = 64;
  let y = FRAME_H - 400;

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  const nameSize = fitText(ctx, content.dishName, FRAME_W - padX * 2, 84, "'Playfair Display', Georgia, serif");
  ctx.font = `900 ${nameSize}px 'Playfair Display', Georgia, serif`;
  ctx.fillText(content.dishName, padX, y);

  if (content.dishNameUz) {
    y += 52;
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '400 36px Inter, system-ui, sans-serif';
    ctx.fillText(content.dishNameUz, padX, y);
  }

  if (content.price) {
    y += 66;
    ctx.fillStyle = gold;
    ctx.font = '700 44px Inter, system-ui, sans-serif';
    ctx.fillText(content.price, padX, y);
  }

  // Промокод уезжает с гостем домой — выгода за следующий визит,
  // а не разовая скидка на месте.
  if (brand.promoCode) {
    const chip: Rect = { x: padX, y: FRAME_H - 200, w: FRAME_W - padX * 2, h: 96 };
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundedRect(ctx, chip, 24);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    roundedRect(ctx, chip, 24);
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = '700 36px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const discount = brand.promoDiscount ? `−${brand.promoDiscount}% ` : '';
    ctx.fillText(`${discount}по коду ${brand.promoCode}`, chip.x + 32, chip.y + chip.h / 2);
    ctx.textBaseline = 'alphabetic';
  }

  // ── Подпись издания ──
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 28px Inter, system-ui, sans-serif';
  ctx.fillText('FRESH WEEKLY · Живое меню', padX, FRAME_H - 56);

  ctx.fillStyle = accent;
  ctx.fillRect(layout.accentBar.x, layout.accentBar.y, layout.accentBar.w, layout.accentBar.h);
}
