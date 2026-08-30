// ════════════════════════════════════════════════════════════
// Номера журнала: список, заведение карточки, публикация, удаление.
//
// ЧТО ЗДЕСЬ БЫЛО. Роут вёл `RestaurantIssue` — персональный номер, который
// раскладывал крон блоками и переписывал ИИ. Номера так не делаются:
// вёрстка идёт руками и публикуется скриптом в `public/magazine`, а база
// хранит карточку вышедшего номера. Генерации здесь больше нет — только
// публикация.
//
// GET    ?id=…       — один номер (или список без ?id)
// POST   { number… } — завести номер
// PATCH  { id, … }   — правка, в том числе публикация
// DELETE ?id=…       — удалить
// ════════════════════════════════════════════════════════════
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { LIST_LIMIT } from '@/lib/api/listLimit';
import { parseBody } from '@/lib/api/parseBody';
import { slugify } from '@/lib/slug';
import { RUBRICS } from '@/lib/magazine/rubrics';

export const dynamic = 'force-dynamic';

const RUBRIC_IDS = RUBRICS.map((r) => r.id) as [string, ...string[]];

const baseSchema = z.object({
  number: z.number().int().min(1).max(9999),
  slug: z.string().trim().max(80).optional(),
  titleRu: z.string().trim().min(1).max(200),
  titleUz: z.string().trim().max(200).optional().nullable(),
  summaryRu: z.string().trim().max(2000).optional().nullable(),
  summaryUz: z.string().trim().max(2000).optional().nullable(),
  coverImage: z.string().trim().max(500).optional().nullable(),
  webUrl: z.string().trim().max(500).optional().nullable(),
  pdfUrl: z.string().trim().max(500).optional().nullable(),
  topics: z.array(z.enum(RUBRIC_IDS)).max(RUBRIC_IDS.length).optional(),
  restaurantId: z.string().trim().max(64).optional().nullable(),
  isPublished: z.boolean().optional(),
});

const updateSchema = baseSchema.partial().extend({ id: z.string().min(1) });

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const id = new URL(request.url).searchParams.get('id');

  if (id) {
    const issue = await prisma.magazineIssue.findUnique({
      where: { id },
      include: { restaurant: { select: { id: true, name: true } } },
    });
    if (!issue) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(issue);
  }

  const list = await prisma.magazineIssue.findMany({
    orderBy: { number: 'desc' },
    take: LIST_LIMIT,
    include: {
      restaurant: { select: { name: true } },
      _count: { select: { articles: true, printOrders: true } },
    },
  });
  return NextResponse.json(list);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const parsed = await parseBody(request, baseSchema);
  if (!parsed.ok) return parsed.response;
  const d = parsed.data;

  // Слаг совпадает с именем файлов номера в public/magazine — по нему
  // страница находит вёрстку и PDF, поэтому он приводится к тому же виду,
  // что и все публичные адреса.
  const slug = slugify(d.slug || d.titleRu, `fresh-weekly-${d.number}`);
  const taken = await prisma.magazineIssue.findFirst({
    where: { OR: [{ slug }, { number: d.number }] },
    select: { slug: true, number: true },
  });
  if (taken) {
    return NextResponse.json(
      { error: taken.number === d.number ? `Номер №${d.number} уже заведён` : `Адрес «${slug}» занят` },
      { status: 409 },
    );
  }

  const created = await prisma.magazineIssue.create({
    data: {
      number: d.number,
      slug,
      titleRu: d.titleRu,
      titleUz: d.titleUz || null,
      summaryRu: d.summaryRu || null,
      summaryUz: d.summaryUz || null,
      coverImage: d.coverImage || null,
      webUrl: d.webUrl || null,
      pdfUrl: d.pdfUrl || null,
      topics: d.topics ?? [],
      restaurantId: d.restaurantId || null,
      isPublished: d.isPublished ?? false,
      publishedAt: d.isPublished ? new Date() : null,
    },
  });
  return NextResponse.json(created);
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const parsed = await parseBody(request, updateSchema);
  if (!parsed.ok) return parsed.response;
  const { id, ...d } = parsed.data;

  const current = await prisma.magazineIssue.findUnique({
    where: { id },
    select: { isPublished: true, publishedAt: true },
  });
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.magazineIssue.update({
    where: { id },
    data: {
      ...(d.number !== undefined ? { number: d.number } : {}),
      ...(d.slug ? { slug: slugify(d.slug, 'fresh-weekly') } : {}),
      ...(d.titleRu !== undefined ? { titleRu: d.titleRu } : {}),
      ...(d.titleUz !== undefined ? { titleUz: d.titleUz || null } : {}),
      ...(d.summaryRu !== undefined ? { summaryRu: d.summaryRu || null } : {}),
      ...(d.summaryUz !== undefined ? { summaryUz: d.summaryUz || null } : {}),
      ...(d.coverImage !== undefined ? { coverImage: d.coverImage || null } : {}),
      ...(d.webUrl !== undefined ? { webUrl: d.webUrl || null } : {}),
      ...(d.pdfUrl !== undefined ? { pdfUrl: d.pdfUrl || null } : {}),
      ...(d.topics !== undefined ? { topics: d.topics } : {}),
      ...(d.restaurantId !== undefined ? { restaurantId: d.restaurantId || null } : {}),
      // Дату публикации ставим только при переходе «не вышел → вышел»:
      // повторное нажатие не должно двигать номер в начало архива.
      ...(d.isPublished !== undefined
        ? {
            isPublished: d.isPublished,
            publishedAt: d.isPublished ? (current.publishedAt ?? new Date()) : null,
          }
        : {}),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Счета за тираж ссылаются на номер каскадом: удаление номера стирает и
  // выставленные по нему счета, поэтому оно запрещено, пока они есть.
  const billed = await prisma.printOrder.count({ where: { issueId: id } });
  if (billed > 0) {
    return NextResponse.json(
      { error: `По номеру выставлено счетов: ${billed}. Сначала снимите его с публикации.` },
      { status: 409 },
    );
  }

  await prisma.magazineIssue.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
