import { prisma } from '@repo/database';

import { channelDef } from './registry';
import { taxonomyFor } from './taxonomy';

// ══════════════════════════════════════════════════════════════════════
// Связка «товар × канал».
//
// Пока листингов нет, синхронизировать нечего: очередь пуста, площадка
// показывает старое, а экран «Каналы» рисует ноль карточек и выглядит
// сломанным. Заводить их по одному руками для сорока позиций никто не
// станет — поэтому есть эта операция: связать весь активный каталог.
//
// Что она НЕ делает: не публикует. Созданный листинг — это «товар
// разрешён к показу в канале», а показывать его или нет, решает
// `availabilityFor` при каждой синхронизации.
// ══════════════════════════════════════════════════════════════════════

export interface LinkReport {
  created: number;
  skippedPerishable: number;
  total: number;
}

/**
 * Завести листинги для всех активных товаров канала.
 *
 * Скоропорт на площадку, которая его не возит, не заводится вовсе —
 * иначе каждая синхронизация честно снимала бы его с публикации по кругу,
 * а владелец видел бы сорок строк «снято» и не понимал, почему.
 */
export async function linkCatalog(code: string): Promise<LinkReport | null> {
  const def = channelDef(code);
  if (!def) return null;

  const channel = await prisma.salesChannel.findUnique({ where: { code }, select: { id: true } });
  if (!channel) return null;

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, category: { select: { slug: true } } },
  });

  const existing = await prisma.channelListing.findMany({
    where: { channelId: channel.id },
    select: { productId: true },
  });
  const known = new Set(existing.map((l) => l.productId));

  let created = 0;
  let skippedPerishable = 0;

  for (const product of products) {
    if (known.has(product.id)) continue;

    const { perishable } = taxonomyFor(product.category?.slug ?? null);
    if (perishable && !def.allowsPerishable) {
      skippedPerishable += 1;
      continue;
    }

    await prisma.channelListing.create({
      data: {
        channelId: channel.id,
        productId: product.id,
        // Артикул витрины — то, чем площадки оперируют охотнее нашего id.
        // Свой идентификатор карточки площадка пришлёт при первой выгрузке.
        externalId: product.sku,
      },
    });
    created += 1;
  }

  const total = await prisma.channelListing.count({ where: { channelId: channel.id } });
  return { created, skippedPerishable, total };
}
