import { token, alpha, solid } from '@/lib/canvasTokens';
import {
  FRAME_W, FRAME_H, Rect, FrameBrand, FrameContent, frameLayout, instagramHandle,
} from './frame';

const DEFAULT_ACCENT = token('brand-primary');
const DEFAULT_GOLD = token('editorial-gold');

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

function fitText(ctx: Ctx, text: string, maxWidth: number, startSize: number, font: string): number {
  let size = startSize;
  ctx.font = `${size}px ${font}`;
  while (ctx.measureText(text).width > maxWidth && size > 28) {
    size -= 4;
    ctx.font = `${size}px ${font}`;
  }
  return size;
}

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

  ctx.save();
  ctx.filter = 'brightness(1.08) contrast(1.06) saturate(1.12)';
  const s = layout.source;
  ctx.drawImage(source, s.x, s.y, s.w, s.h, 0, 0, FRAME_W, FRAME_H);
  ctx.restore();

  const top = ctx.createLinearGradient(0, 0, 0, layout.header.h);
  top.addColorStop(0, alpha('overlay-dark-rgb', 0.65));
  top.addColorStop(1, alpha('overlay-dark-rgb', 0));
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, FRAME_W, layout.header.h);

  const bottom = ctx.createLinearGradient(0, layout.footer.y, 0, FRAME_H);
  bottom.addColorStop(0, alpha('overlay-dark-rgb', 0));
  bottom.addColorStop(0.45, alpha('overlay-dark-rgb', 0.72));
  bottom.addColorStop(1, alpha('overlay-dark-rgb', 0.92));
  ctx.fillStyle = bottom;
  ctx.fillRect(0, layout.footer.y, FRAME_W, layout.footer.h);

  let textX = 64;
  if (logoImage) {
    ctx.save();
    roundedRect(ctx, layout.logo, 28);
    ctx.clip();
    ctx.drawImage(logoImage, layout.logo.x, layout.logo.y, layout.logo.w, layout.logo.h);
    ctx.restore();
    textX = layout.logo.x + layout.logo.w + 24;
  }
  ctx.fillStyle = solid('overlay-light-rgb');
  ctx.textBaseline = 'middle';
  ctx.font = '700 44px Inter, system-ui, sans-serif';
  ctx.fillText(brand.name, textX, layout.logo.y + 46);
  const handle = instagramHandle(brand.instagram);
  if (handle) {
    ctx.fillStyle = gold;
    ctx.font = '500 32px Inter, system-ui, sans-serif';
    ctx.fillText(handle, textX, layout.logo.y + 96);
  }

  const padX = 64;
  let y = FRAME_H - 400;

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = solid('overlay-light-rgb');
  const nameSize = fitText(ctx, content.dishName, FRAME_W - padX * 2, 84, "'Playfair Display', Georgia, serif");
  ctx.font = `900 ${nameSize}px 'Playfair Display', Georgia, serif`;
  ctx.fillText(content.dishName, padX, y);

  if (content.dishNameUz) {
    y += 52;
    ctx.fillStyle = alpha('overlay-light-rgb', 0.62);
    ctx.font = '400 36px Inter, system-ui, sans-serif';
    ctx.fillText(content.dishNameUz, padX, y);
  }

  if (content.price) {
    y += 66;
    ctx.fillStyle = gold;
    ctx.font = '700 44px Inter, system-ui, sans-serif';
    ctx.fillText(content.price, padX, y);
  }

  if (brand.promoCode) {
    const chip: Rect = { x: padX, y: FRAME_H - 200, w: FRAME_W - padX * 2, h: 96 };
    ctx.fillStyle = alpha('overlay-light-rgb', 0.12);
    roundedRect(ctx, chip, 24);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    roundedRect(ctx, chip, 24);
    ctx.stroke();

    ctx.fillStyle = solid('overlay-light-rgb');
    ctx.font = '700 36px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const discount = brand.promoDiscount ? `−${brand.promoDiscount}% ` : '';
    ctx.fillText(`${discount}по коду ${brand.promoCode}`, chip.x + 32, chip.y + chip.h / 2);
    ctx.textBaseline = 'alphabetic';
  }

  ctx.fillStyle = alpha('overlay-light-rgb', 0.55);
  ctx.font = '600 28px Inter, system-ui, sans-serif';
  ctx.fillText('FRESH WEEKLY · Живое меню', padX, FRAME_H - 56);

  ctx.fillStyle = accent;
  ctx.fillRect(layout.accentBar.x, layout.accentBar.y, layout.accentBar.w, layout.accentBar.h);
}
