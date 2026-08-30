// ════════════════════════════════════════════════════════════
// GET /api/magazine/current — свежий вышедший номер.
//
// ЗАЧЕМ ПУБЛИЧНАЯ ДВЕРЬ. Номер знают три места: сайт, бот витрины и
// рассылки офиса. У бота он был вписан в код («Выпуск #2, корейская
// кухня»), а файл отдавался по слагу из переменной окружения — и оба
// разошлись с реальностью: читателю обещали один номер, присылали другой.
// Источник правды теперь один — карточка номера в базе.
//
// Отдаёт только опубликованное: черновик номера не должен утекать ни в
// бота, ни в канал.
// ════════════════════════════════════════════════════════════
import { NextResponse } from 'next/server';
import { latestIssue } from '@/lib/magazine/content';

export const dynamic = 'force-dynamic';

const SITE = process.env.NEXT_PUBLIC_URL || 'https://microgreenuzbekistan.com';

/** Относительный путь номера → абсолютный: бот отдаёт файл по ссылке. */
function absolute(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith('http') ? path : `${SITE}${path.startsWith('/') ? '' : '/'}${path}`;
}

export async function GET() {
  const issue = await latestIssue();
  if (!issue) return NextResponse.json({ error: 'Опубликованных номеров нет' }, { status: 404 });

  return NextResponse.json({
    number: issue.number,
    slug: issue.slug,
    titleRu: issue.titleRu,
    titleUz: issue.titleUz,
    summaryRu: issue.summaryRu,
    summaryUz: issue.summaryUz,
    topics: issue.topics,
    restaurantName: issue.restaurantName,
    coverUrl: absolute(issue.coverImage),
    webUrl: absolute(issue.webUrl),
    pdfUrl: absolute(issue.pdfUrl),
    magazineUrl: `${SITE}/magazine`,
  });
}
