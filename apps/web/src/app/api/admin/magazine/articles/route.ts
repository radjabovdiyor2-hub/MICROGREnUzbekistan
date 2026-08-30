// ════════════════════════════════════════════════════════════
// Материалы журнала: страницы рубрик на сайте.
//
// Секции пересобираются целиком, как у рецептов: редактор шлёт полный
// список, а точечная синхронизация порядка и удалений здесь дороже своей
// пользы.
//
// GET    ?id=…      — один материал со секциями (или список без ?id)
// POST   { … }      — создать
// PATCH  { id, … }  — обновить, в том числе опубликовать
// DELETE ?id=…      — удалить
// ════════════════════════════════════════════════════════════
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { LIST_LIMIT } from '@/lib/api/listLimit';
import { parseBody } from '@/lib/api/parseBody';
import { slugify } from '@/lib/slug';
import { RUBRICS, RECIPE_RUBRIC } from '@/lib/magazine/rubrics';

export const dynamic = 'force-dynamic';

// Рецепты живут своей моделью со своим редактором: материал в эту рубрику
// не пишется, иначе в ленте окажутся две разные сущности под одним видом.
const WRITABLE_RUBRICS = RUBRICS
  .map((r) => r.id)
  .filter((id) => id !== RECIPE_RUBRIC) as [string, ...string[]];

const sectionSchema = z.object({
  headingRu: z.string().trim().max(200).optional().nullable(),
  headingUz: z.string().trim().max(200).optional().nullable(),
  textRu: z.string().trim().max(8000),
  textUz: z.string().trim().max(8000).optional().nullable(),
  image: z.string().trim().max(500).optional().nullable(),
});

const baseSchema = z.object({
  slug: z.string().trim().max(120).optional(),
  rubric: z.enum(WRITABLE_RUBRICS),
  titleRu: z.string().trim().min(1).max(200),
  titleUz: z.string().trim().max(200).optional().nullable(),
  excerptRu: z.string().trim().max(600).optional().nullable(),
  excerptUz: z.string().trim().max(600).optional().nullable(),
  coverImage: z.string().trim().max(500).optional().nullable(),
  issueId: z.string().trim().max(64).optional().nullable(),
  productId: z.string().trim().max(64).optional().nullable(),
  isPublished: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  sections: z.array(sectionSchema).max(40).optional(),
});

const updateSchema = baseSchema.partial().extend({ id: z.string().min(1) });

type SectionInput = z.infer<typeof sectionSchema>;

function normSections(sections: SectionInput[]) {
  return sections
    .filter((s) => s.textRu.trim())
    .map((s, i) => ({
      order: i,
      headingRu: s.headingRu?.trim() || null,
      headingUz: s.headingUz?.trim() || null,
      textRu: s.textRu.trim(),
      textUz: s.textUz?.trim() || null,
      image: s.image || null,
    }));
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const id = new URL(request.url).searchParams.get('id');

  if (id) {
    const article = await prisma.magazineArticle.findUnique({
      where: { id },
      include: { sections: { orderBy: { order: 'asc' } } },
    });
    if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(article);
  }

  const list = await prisma.magazineArticle.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    take: LIST_LIMIT,
    include: {
      _count: { select: { sections: true } },
      issue: { select: { number: true } },
    },
  });
  return NextResponse.json(list);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const parsed = await parseBody(request, baseSchema);
  if (!parsed.ok) return parsed.response;
  const d = parsed.data;

  const slug = slugify(d.slug || d.titleRu, 'material');
  const taken = await prisma.magazineArticle.findUnique({ where: { slug }, select: { id: true } });
  if (taken) return NextResponse.json({ error: `Адрес «${slug}» занят` }, { status: 409 });

  const created = await prisma.magazineArticle.create({
    data: {
      slug,
      rubric: d.rubric,
      titleRu: d.titleRu,
      titleUz: d.titleUz || null,
      excerptRu: d.excerptRu || null,
      excerptUz: d.excerptUz || null,
      coverImage: d.coverImage || null,
      issueId: d.issueId || null,
      productId: d.productId || null,
      isPublished: d.isPublished ?? false,
      publishedAt: d.isPublished ? new Date() : null,
      sortOrder: d.sortOrder ?? 0,
      sections: { create: normSections(d.sections ?? []) },
    },
    include: { sections: { orderBy: { order: 'asc' } } },
  });
  return NextResponse.json(created);
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const parsed = await parseBody(request, updateSchema);
  if (!parsed.ok) return parsed.response;
  const { id, ...d } = parsed.data;

  const current = await prisma.magazineArticle.findUnique({
    where: { id },
    select: { publishedAt: true },
  });
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const article = await prisma.$transaction(async (tx) => {
    if (d.sections) {
      await tx.magazineArticleSection.deleteMany({ where: { articleId: id } });
      await tx.magazineArticleSection.createMany({
        data: normSections(d.sections).map((s) => ({ ...s, articleId: id })),
      });
    }
    return tx.magazineArticle.update({
      where: { id },
      data: {
        ...(d.slug ? { slug: slugify(d.slug, 'material') } : {}),
        ...(d.rubric !== undefined ? { rubric: d.rubric } : {}),
        ...(d.titleRu !== undefined ? { titleRu: d.titleRu } : {}),
        ...(d.titleUz !== undefined ? { titleUz: d.titleUz || null } : {}),
        ...(d.excerptRu !== undefined ? { excerptRu: d.excerptRu || null } : {}),
        ...(d.excerptUz !== undefined ? { excerptUz: d.excerptUz || null } : {}),
        ...(d.coverImage !== undefined ? { coverImage: d.coverImage || null } : {}),
        ...(d.issueId !== undefined ? { issueId: d.issueId || null } : {}),
        ...(d.productId !== undefined ? { productId: d.productId || null } : {}),
        ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
        ...(d.isPublished !== undefined
          ? {
              isPublished: d.isPublished,
              publishedAt: d.isPublished ? (current.publishedAt ?? new Date()) : null,
            }
          : {}),
      },
      include: { sections: { orderBy: { order: 'asc' } } },
    });
  });
  return NextResponse.json(article);
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await prisma.magazineArticle.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
