// ════════════════════════════════════════════════════════════
// Экспорт QR блюд как файлов для внешней вёрстки журнала.
// GET ?restaurantId=…&code=N&format=png|svg — QR одного блюда → /m/<slug>/d/<code>
// GET ?restaurantId=…&menu=1&format=png|svg  — QR ресторана     → /m/<slug>
// GET ?restaurantId=…&sheet=1                — SVG-лист со всеми QR блюд + номерами
//
// Журнал собирается снаружи (Canva/InDesign), поэтому QR приезжает файлом,
// а не рисуется в движке журнала.
// ════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { qrPng, qrSvg, dishUrl, menuUrl } from '@/lib/magazine/qr';
import { LIST_LIMIT } from '@/lib/api/listLimit';

export const dynamic = 'force-dynamic';

// Имя файла для скачивания: только латиница/цифры, чтобы не ломалось в заголовке
function fileSafe(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'qr';
}

function pngResponse(buf: Buffer, name: string) {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${name}.png"`,
    },
  });
}

function svgResponse(svg: string, name: string) {
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}.svg"`,
    },
  });
}

// Лист всех блюд: QR + номер + название, чтобы скачать всё разом одним файлом.
// ZIP не делаем — новой зависимости избегаем, а один SVG печатается и режется
// так же удобно.
function buildSheet(slug: string, cells: { code: number; name: string; svg: string }[]): string {
  const COLS = 3;
  const CELL = 200;
  const GAP = 24;
  const LABEL = 40;
  const rows = Math.ceil(cells.length / COLS);
  const width = COLS * CELL + (COLS + 1) * GAP;
  const height = rows * (CELL + LABEL) + (rows + 1) * GAP;

  const inner = cells.map((c, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = GAP + col * (CELL + GAP);
    const y = GAP + row * (CELL + LABEL + GAP);
    // Вкладываем родной <svg> кода блюда, меняя только размер: его собственный
    // viewBox (по числу модулей) сохраняем, иначе QR сжимается в угол ячейки.
    const vb = c.svg.match(/viewBox="[^"]*"/)?.[0] ?? 'viewBox="0 0 33 33"';
    const nested = c.svg.replace(/<svg[^>]*>/, `<svg width="${CELL}" height="${CELL}" ${vb} preserveAspectRatio="xMidYMid meet">`);
    const label = `${c.code} · ${c.name}`.replace(/[<>&]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]!));
    return `
      <g transform="translate(${x} ${y})">
        ${nested}
        <text x="${CELL / 2}" y="${CELL + 26}" text-anchor="middle" font-family="Inter, sans-serif" font-size="18" fill="#111">${label}</text>
      </g>`;
  }).join('');

  // Цвета ниже — литералами намеренно: SVG собирается строкой на сервере и
  // скачивается отдельным файлом для печати, то есть живёт вне документа и
  // каскада CSS, где var() резолвить некому.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="${GAP}" y="${GAP - 6}" font-family="Inter, sans-serif" font-size="14" fill="#888">FRESH WEEKLY · ${slug} · QR меню</text>
  ${inner}
</svg>`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();

  const url = new URL(req.url);
  const restaurantId = url.searchParams.get('restaurantId');
  if (!restaurantId) return NextResponse.json({ error: 'restaurantId required' }, { status: 400 });

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
  const slug = restaurant.slug ?? restaurant.id;
  const format = url.searchParams.get('format') === 'svg' ? 'svg' : 'png';

  // QR ресторана → витрина меню
  if (url.searchParams.get('menu')) {
    const data = menuUrl(slug);
    const name = `qr-${fileSafe(slug)}-menu`;
    return format === 'svg' ? svgResponse(await qrSvg(data), name) : pngResponse(await qrPng(data), name);
  }

  // Лист всех блюд
  if (url.searchParams.get('sheet')) {
    const dishes = await prisma.dish.findMany({
      where: { restaurantId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      take: LIST_LIMIT,
    });
    if (!dishes.length) return NextResponse.json({ error: 'No dishes' }, { status: 404 });
    const cells = await Promise.all(dishes.map(async (d) => ({
      code: d.code,
      name: d.nameRu,
      svg: await qrSvg(dishUrl(slug, d.code)),
    })));
    return svgResponse(buildSheet(slug, cells), `qr-${fileSafe(slug)}-sheet`);
  }

  // QR одного блюда
  const code = Number(url.searchParams.get('code'));
  if (!Number.isFinite(code)) return NextResponse.json({ error: 'code required' }, { status: 400 });
  const dish = await prisma.dish.findUnique({
    where: { restaurantId_code: { restaurantId, code } },
  });
  if (!dish) return NextResponse.json({ error: 'Dish not found' }, { status: 404 });

  const data = dishUrl(slug, code);
  const name = `qr-${fileSafe(slug)}-${code}`;
  return format === 'svg' ? svgResponse(await qrSvg(data), name) : pngResponse(await qrPng(data), name);
}
