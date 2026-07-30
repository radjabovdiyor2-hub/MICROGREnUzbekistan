// ════════════════════════════════════════════════════════════
// Рецепты: список, создание/обновление (с шагами и ингредиентами), удаление.
// GET    ?id=…       — один рецепт со связями (или список без ?id)
// POST   { recipe }  — создать
// PATCH  { id, ... } — обновить рецепт + пересобрать шаги/ингредиенты
// DELETE ?id=…       — удалить
// ════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { slugify as makeSlug } from '@/lib/slug';

export const dynamic = 'force-dynamic';

// slugify общий для всех публичных адресов (lib/slug.ts): транслитерирует
// кириллицу. Прежняя локальная версия её СОХРАНЯЛА, и рецепт с русским
// названием получал слаг вида «укц» — его страница отдавала 404.
const slugify = (s: string) => makeSlug(s, 'recipe');

interface StepInput { order?: number; textRu?: string; textUz?: string; image?: string; timerSeconds?: number | null }
interface IngredientInput { order?: number; nameRu?: string; nameUz?: string; amount?: string; productId?: string | null }

function normSteps(steps: StepInput[] = []) {
  return steps
    .filter((s) => (s.textRu ?? '').trim())
    .map((s, i) => ({
      order: s.order ?? i,
      textRu: s.textRu!.trim(),
      textUz: s.textUz?.trim() || null,
      image: s.image || null,
      timerSeconds: s.timerSeconds ?? null,
    }));
}

function normIngredients(items: IngredientInput[] = []) {
  return items
    .filter((i) => (i.nameRu ?? '').trim())
    .map((i, idx) => ({
      order: i.order ?? idx,
      nameRu: i.nameRu!.trim(),
      nameUz: i.nameUz?.trim() || null,
      amount: i.amount?.trim() || null,
      productId: i.productId || null,
    }));
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  const id = new URL(req.url).searchParams.get('id');
  if (id) {
    const recipe = await prisma.recipe.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: 'asc' } }, ingredients: { orderBy: { order: 'asc' } } },
    });
    if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(recipe);
  }
  const list = await prisma.recipe.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    include: { _count: { select: { steps: true, ingredients: true } } },
  });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body?.titleRu) return NextResponse.json({ error: 'titleRu required' }, { status: 400 });

  const recipe = await prisma.recipe.create({
    data: {
      slug: body.slug ? slugify(body.slug) : slugify(body.titleRu),
      titleRu: body.titleRu,
      titleUz: body.titleUz || null,
      descriptionRu: body.descriptionRu || null,
      descriptionUz: body.descriptionUz || null,
      heroImage: body.heroImage || null,
      cookMinutes: body.cookMinutes ?? null,
      servings: body.servings ?? null,
      isActive: body.isActive ?? true,
      sortOrder: body.sortOrder ?? 0,
      steps: { create: normSteps(body.steps) },
      ingredients: { create: normIngredients(body.ingredients) },
    },
    include: { steps: true, ingredients: true },
  });
  return NextResponse.json(recipe);
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Шаги и ингредиенты пересобираем целиком — редактор шлёт полный список,
  // а точечная синхронизация порядка/удалений здесь дороже своей пользы.
  const recipe = await prisma.$transaction(async (tx) => {
    if (Array.isArray(body.steps)) {
      await tx.recipeStep.deleteMany({ where: { recipeId: body.id } });
      await tx.recipeStep.createMany({ data: normSteps(body.steps).map((s) => ({ ...s, recipeId: body.id })) });
    }
    if (Array.isArray(body.ingredients)) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: body.id } });
      await tx.recipeIngredient.createMany({ data: normIngredients(body.ingredients).map((i) => ({ ...i, recipeId: body.id })) });
    }
    return tx.recipe.update({
      where: { id: body.id },
      data: {
        ...(body.titleRu != null ? { titleRu: body.titleRu } : {}),
        ...(body.titleUz !== undefined ? { titleUz: body.titleUz || null } : {}),
        ...(body.slug ? { slug: slugify(body.slug) } : {}),
        ...(body.descriptionRu !== undefined ? { descriptionRu: body.descriptionRu || null } : {}),
        ...(body.descriptionUz !== undefined ? { descriptionUz: body.descriptionUz || null } : {}),
        ...(body.heroImage !== undefined ? { heroImage: body.heroImage || null } : {}),
        ...(body.cookMinutes !== undefined ? { cookMinutes: body.cookMinutes ?? null } : {}),
        ...(body.servings !== undefined ? { servings: body.servings ?? null } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
      include: { steps: { orderBy: { order: 'asc' } }, ingredients: { orderBy: { order: 'asc' } } },
    });
  });
  return NextResponse.json(recipe);
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await prisma.recipe.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
