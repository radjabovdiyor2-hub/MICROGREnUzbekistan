// ════════════════════════════════════════════════════════════
// Контент журнала для публичных страниц (server-only).
//
// Номер — карточка вышедшего выпуска: вёрстка и PDF лежат файлами в
// `public/magazine`, база хранит только «что это за номер и вышел ли он».
// Материал — веб-страница рубрики. Рецепты сюда не попадают: у них своя
// модель и свои печатные адреса (см. lib/recipes.ts).
// ════════════════════════════════════════════════════════════
import { prisma } from '@repo/database';
import type { RubricId } from './rubrics';

export interface IssueCard {
  slug: string;
  number: number;
  titleRu: string;
  titleUz: string | null;
  summaryRu: string | null;
  summaryUz: string | null;
  coverImage: string | null;
  webUrl: string | null;
  pdfUrl: string | null;
  topics: string[];
  restaurantName: string | null;
  publishedAt: Date | null;
}

export interface ArticleCard {
  slug: string;
  rubric: string;
  titleRu: string;
  titleUz: string | null;
  excerptRu: string | null;
  coverImage: string | null;
  publishedAt: Date | null;
}

export interface ArticleSectionView {
  id: string;
  headingRu: string | null;
  headingUz: string | null;
  textRu: string;
  textUz: string | null;
  image: string | null;
}

export interface ArticleView extends ArticleCard {
  excerptUz: string | null;
  sections: ArticleSectionView[];
  product: { id: string; nameRu: string; price: number; images: string[] } | null;
  issue: { slug: string; number: number; titleRu: string; webUrl: string | null } | null;
}

const ISSUE_CARD = {
  slug: true, number: true, titleRu: true, titleUz: true, summaryRu: true, summaryUz: true,
  coverImage: true, webUrl: true, pdfUrl: true, topics: true, publishedAt: true,
  restaurant: { select: { name: true } },
} as const;

const ARTICLE_CARD = {
  slug: true, rubric: true, titleRu: true, titleUz: true,
  excerptRu: true, coverImage: true, publishedAt: true,
} as const;

type IssueRow = { restaurant: { name: string } | null } & Omit<IssueCard, 'restaurantName'>;

function toIssueCard(row: IssueRow): IssueCard {
  const { restaurant, ...rest } = row;
  return { ...rest, restaurantName: restaurant?.name ?? null };
}

/** Вышедшие номера, свежий первым. */
export async function listPublishedIssues(take = 24): Promise<IssueCard[]> {
  const rows = await prisma.magazineIssue.findMany({
    where: { isPublished: true },
    select: ISSUE_CARD,
    orderBy: { number: 'desc' },
    take,
  });
  return rows.map(toIssueCard);
}

/** Свежий номер: обложка витрины журнала и то, что отдаёт бот. */
export async function latestIssue(): Promise<IssueCard | null> {
  const row = await prisma.magazineIssue.findFirst({
    where: { isPublished: true },
    select: ISSUE_CARD,
    orderBy: { number: 'desc' },
  });
  return row ? toIssueCard(row) : null;
}

/** Опубликованные материалы: вся лента или одна рубрика. */
export async function listArticles(rubric?: RubricId, take = 24): Promise<ArticleCard[]> {
  return prisma.magazineArticle.findMany({
    where: { isPublished: true, ...(rubric ? { rubric } : {}) },
    select: ARTICLE_CARD,
    orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
    take,
  });
}

/** Сколько материалов в каждой рубрике — подпись на карточке рубрики. */
export async function countArticlesByRubric(): Promise<Record<string, number>> {
  const rows = await prisma.magazineArticle.groupBy({
    by: ['rubric'],
    where: { isPublished: true },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.rubric, r._count._all]));
}

/** Материал целиком. `null` — нет такого или снят с публикации. */
export async function loadArticleBySlug(slug: string): Promise<ArticleView | null> {
  const row = await prisma.magazineArticle.findFirst({
    where: { slug, isPublished: true },
    select: {
      ...ARTICLE_CARD,
      excerptUz: true,
      sections: {
        orderBy: { order: 'asc' },
        select: { id: true, headingRu: true, headingUz: true, textRu: true, textUz: true, image: true },
      },
      product: { select: { id: true, nameRu: true, price: true, images: true } },
      issue: { select: { slug: true, number: true, titleRu: true, webUrl: true, isPublished: true } },
    },
  });
  if (!row) return null;
  // Ссылка «читать весь номер» ведёт только на вышедший номер: у черновика
  // файла вёрстки ещё нет, и кнопка отправляла бы читателя в 404.
  const { issue, ...rest } = row;
  return { ...rest, issue: issue?.isPublished ? issue : null };
}

/** Адреса материалов для sitemap. */
export async function listArticleRoutes(): Promise<{ rubric: string; slug: string; updatedAt: Date }[]> {
  return prisma.magazineArticle.findMany({
    where: { isPublished: true },
    select: { rubric: true, slug: true, updatedAt: true },
    orderBy: { publishedAt: 'desc' },
  });
}
