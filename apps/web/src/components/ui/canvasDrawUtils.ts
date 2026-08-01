export function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawMicroLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, ls: number, hue: number, leafL: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(dir);
  ctx.beginPath(); ctx.ellipse(0, -ls * 0.65, ls * 0.5, ls, 0, 0, 6.283);
  ctx.fillStyle = `hsl(${hue} 58% ${leafL}%)`; ctx.fill();
  ctx.restore();
}

export function drawSaladLeaf(ctx: CanvasRenderingContext2D, topX: number, topY: number, ls: number, hue: number, leafL: number) {
  const r = ls * 1.1;
  ctx.save();
  ctx.translate(topX, topY);
  ctx.fillStyle = `hsl(${hue} 62% ${leafL + 4}%)`;
  ctx.strokeStyle = `hsl(${hue} 45% ${leafL - 6}%)`;
  ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.55, r, 0, 0, 6.283); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.82, r * 0.2, 0, 6.283);
    ctx.fillStyle = `hsl(${hue + 8} 58% ${leafL + 10}%)`;
    ctx.fill();
  }
  ctx.strokeStyle = `hsl(${hue} 40% ${leafL - 8}%)`;
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(0, r * 0.9); ctx.bezierCurveTo(0, r * 0.3, 0, -r * 0.3, 0, -r * 0.9); ctx.stroke();
  ctx.restore();
}

export function drawSeedDot(ctx: CanvasRenderingContext2D, topX: number, topY: number, ls: number, hue: number, leafL: number) {
  ctx.beginPath();
  ctx.ellipse(topX, topY, ls * 0.32, ls * 0.55, 0.3, 0, 6.283);
  ctx.fillStyle = `hsl(${hue + 18} 48% ${leafL + 8}%)`;
  ctx.fill();
}
