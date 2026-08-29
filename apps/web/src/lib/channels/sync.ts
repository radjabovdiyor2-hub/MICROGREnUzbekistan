import { prisma } from '@repo/database';

import { availabilityFor } from './availability';
import { enqueueChannelUpdate } from './outbox';
import { channelDef } from './registry';

// ══════════════════════════════════════════════════════════════════════
// Что площадка должна показывать прямо сейчас — и чем это отличается от
// того, что мы ей отправили в прошлый раз.
//
// В очередь уходит только РАЗНИЦА. Сорок позиций на канал, из которых за
// минуту меняются одна-две: слать всё каждый прогон значит утопить и
// площадку, и очередь, а заодно потерять в этом потоке единственное
// важное обновление — «остаток кончился».
//
// Снимок отправленного живёт в `ChannelListing` (`syncedStock`, `price`,
// `isPublished`) и обновляется ТОЛЬКО после успешной отправки: иначе
// витрина считала бы отправленным то, что не доехало.
// ══════════════════════════════════════════════════════════════════════

export interface ChannelSyncReport {
  channel: string;
  enqueued: number;
  listings: number;
}

/** Желаемое состояние карточки на площадке. */
export interface DesiredListing {
  productId: string;
  published: boolean;
  stock: number;
  price: number;
  reason: string | null;
}

export async function planChannelSync(now: Date = new Date()): Promise<ChannelSyncReport[]> {
  const channels = await prisma.salesChannel.findMany({
    where: { isActive: true },
    select: {
      id: true, code: true, isActive: true, cities: true, stockBuffer: true,
      markupPercent: true, orderCutoff: true, lastSyncAt: true,
    },
  });

  const reports: ChannelSyncReport[] = [];

  for (const channel of channels) {
    const def = channelDef(channel.code);
    // Фидовому каналу отправлять нечего: выгрузку он забирает сам по
    // ссылке `/feed/*`, и очередь для него была бы пустой работой.
    if (!def || def.syncMode === 'feed') continue;

    const listings = await prisma.channelListing.findMany({
      where: { channelId: channel.id },
      select: {
        productId: true,
        price: true,
        isPublished: true,
        syncedStock: true,
        externalId: true,
        product: {
          select: { id: true, price: true, stock: true, isActive: true, category: { select: { slug: true } } },
        },
      },
    });

    let enqueued = 0;

    for (const listing of listings) {
      const state = availabilityFor(
        {
          id: listing.product.id,
          price: listing.product.price,
          stock: Number(listing.product.stock),
          categorySlug: listing.product.category?.slug ?? null,
          isActive: listing.product.isActive,
        },
        { ...channel },
        now,
      );

      const desired: DesiredListing = state.available
        ? { productId: listing.productId, published: true, stock: state.quantity, price: state.price, reason: null }
        : { productId: listing.productId, published: false, stock: 0, price: listing.price ?? listing.product.price, reason: state.reason };

      const same =
        listing.isPublished === desired.published &&
        listing.syncedStock === desired.stock &&
        listing.price === desired.price;
      if (same) continue;

      await enqueueChannelUpdate({
        channelCode: channel.code,
        topic: 'stock',
        productId: listing.productId,
        payload: {
          productId: listing.productId,
          externalId: listing.externalId,
          available: desired.published,
          quantity: desired.stock,
          price: desired.price,
          reason: desired.reason,
        },
      });

      // Причину снятия пишем сразу: владельцу она нужна на экране, даже
      // пока отправка не прошла. Снимок отправленного (`syncedStock`,
      // `isPublished`) здесь НЕ трогаем — его ставит успешная отправка.
      await prisma.channelListing.update({
        where: { channelId_productId: { channelId: channel.id, productId: listing.productId } },
        data: { pausedReason: desired.reason?.slice(0, 200) ?? null },
      });

      enqueued += 1;
    }

    reports.push({ channel: channel.code, enqueued, listings: listings.length });
  }

  return reports;
}
