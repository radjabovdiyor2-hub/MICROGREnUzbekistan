// ════════════════════════════════════════════════════════════
// Загрузка персонального выпуска из БД + сборка блоков (server-only).
// ════════════════════════════════════════════════════════════
import { prisma } from '@repo/database';
import { composeMagazine } from './types';
import type { Block, MagazineSpec, RestaurantBrand } from './types';
import { buildQrUrl, promoUrl, kidsUrl } from './qr';

export interface LoadedIssue {
  weekNumber: number;
  title: string;
  blocks: Block[];
  brand: RestaurantBrand;
  qrDataUrl?: string;
  kidsQrDataUrl?: string;
  status: string;
}

function asSpec(json: unknown): MagazineSpec {
  const spec = json as MagazineSpec | null;
  return spec && Array.isArray(spec.blocks) ? spec : { blocks: [] };
}

export async function loadIssueBySlug(slug: string): Promise<LoadedIssue | null> {
  const issue = await prisma.restaurantIssue.findUnique({
    where: { webSlug: slug },
    include: { edition: true, restaurant: true },
  });
  if (!issue) return null;

  const blocks = composeMagazine(asSpec(issue.edition.sharedSpec), asSpec(issue.spec));
  const r = issue.restaurant;
  const brand: RestaurantBrand = {
    name: r.name,
    slug: r.slug ?? r.id,
    logo: r.logo,
    instagram: r.instagram,
    brandPrimary: r.brandPrimary,
    brandAccent: r.brandAccent,
    promoCode: r.promoCode,
    promoDiscount: r.promoDiscount,
    menuItems: r.menuItems ?? [],
  };
  const qrDataUrl = r.promoCode ? await buildQrUrl(promoUrl(r.promoCode)) : undefined;
  const kidsQrDataUrl = await buildQrUrl(kidsUrl());

  return {
    weekNumber: issue.edition.weekNumber,
    title: issue.edition.title,
    blocks,
    brand,
    qrDataUrl,
    kidsQrDataUrl,
    status: issue.status,
  };
}

// Список slug для генерации PDF (по статусу)
export async function listIssueSlugs(status?: string): Promise<string[]> {
  const rows = await prisma.restaurantIssue.findMany({
    where: status ? { status } : undefined,
    select: { webSlug: true },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((x) => x.webSlug);
}
