// ════════════════════════════════════════════════════════════
// GET /api/admin/magazine/guest-photos/export?restaurantId=&status=approved
// Отдаёт одобренные кадры одним ZIP + captions.txt с подписями —
// журнал верстается во внешнем редакторе, туда нужны файлы, а не id.
// ════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { getUploadsDir } from '@/lib/uploads';
import { createZip, zipSafeName, type ZipEntry } from '@/lib/zip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();

  const url = new URL(req.url);
  const restaurantId = url.searchParams.get('restaurantId') ?? undefined;
  const status = url.searchParams.get('status') ?? 'approved';

  const photos = await prisma.guestPhoto.findMany({
    where: { ...(restaurantId ? { restaurantId } : {}), status },
    include: { dish: { select: { nameRu: true } }, restaurant: { select: { name: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  if (!photos.length) return NextResponse.json({ error: 'Нет кадров для выгрузки' }, { status: 404 });

  const dir = await getUploadsDir();
  const entries: ZipEntry[] = [];
  const captions: string[] = ['файл — гость — блюдо — дата', ''];
  const missing: string[] = [];

  for (const [i, p] of photos.entries()) {
    const base = path.basename(p.imageUrl);
    // Порядковый номер в имени — чтобы подписи в captions.txt совпадали
    // с порядком файлов при раскладке в макете.
    const name = zipSafeName(`${String(i + 1).padStart(2, '0')}-${base}`);
    try {
      entries.push({ name, data: await readFile(path.join(dir, base)) });
    } catch {
      // Файл мог быть удалён с диска — не роняем всю выгрузку
      missing.push(base);
      continue;
    }
    captions.push([
      name,
      p.guestName || 'без имени',
      p.dish?.nameRu || '—',
      p.createdAt.toISOString().slice(0, 10),
    ].join(' — '));
  }

  if (!entries.length) return NextResponse.json({ error: 'Файлы кадров не найдены на диске' }, { status: 404 });
  if (missing.length) captions.push('', `не найдены на диске: ${missing.join(', ')}`);

  entries.push({ name: 'captions.txt', data: Buffer.from(captions.join('\r\n'), 'utf8') });

  const slug = photos[0].restaurant?.slug ?? 'all';
  const today = new Date().toISOString().slice(0, 10);
  const zip = createZip(entries);

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="guests-${zipSafeName(slug)}-${today}.zip"`,
    },
  });
}
