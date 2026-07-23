// ════════════════════════════════════════════════════════════
// QR рецепта как файл для внешней вёрстки журнала.
// GET ?slug=…&format=png|svg → /recipe/<slug>
// ════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { qrPng, qrSvg, recipeUrl } from '@/lib/magazine/qr';

export const dynamic = 'force-dynamic';

function fileSafe(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'recipe';
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const data = recipeUrl(slug);
  const name = `qr-recipe-${fileSafe(slug)}`;
  if (url.searchParams.get('format') === 'svg') {
    return new NextResponse(await qrSvg(data), {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}.svg"`,
      },
    });
  }
  const buf = await qrPng(data);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${name}.png"`,
    },
  });
}
