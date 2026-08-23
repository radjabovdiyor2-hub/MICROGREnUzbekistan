import { prisma } from '@repo/database';
import type { Prisma } from '@repo/database';

// ══════════════════════════════════════════════════════════════════════
// Слияние двух аккаунтов одного человека.
//
// ЗАЧЕМ
//
// У витрины три двери, и каждая заводит пользователя по своему ключу:
// оформление заказа — по телефону, вход через Telegram и Mini App — по
// `telegramId`. Ни одна не смотрит на две другие. Человек, заказавший в
// боте (телефон), а потом нажавший «Войти через Telegram», получал ВТОРОЙ
// аккаунт: бонусы и история заказов делились пополам, и ничто это не
// сшивало.
//
// КТО ВЫЖИВАЕТ
//
// Старший по `createdAt`. У него длиннее история и его `referralCode` уже
// мог разойтись по друзьям — менять такой код значит сломать чужие ссылки.
//
// ЧТО ДЕЛАЕМ С УНИКАЛЬНЫМИ ПАРАМИ
//
// У `CartItem`, `Favorite` и `Review` стоит `@@unique([userId, productId])`.
// Слепой `updateMany` на них падает, когда один товар есть у обоих. Поэтому
// переносим только то, чего у выжившего ещё нет, а остальное удаляем: две
// строки — это один и тот же товар у одного и того же человека.
// ══════════════════════════════════════════════════════════════════════

export interface MergeResult {
  /** Аккаунт, который остался. */
  keptId: string;
  /** Аккаунт, которого больше нет. `null`, если сливать было нечего. */
  removedId: string | null;
  /** Баллы после слияния — сумма обоих балансов. */
  bonusPoints: number;
}

/** Таблицы, где на пользователя нет уникальной пары — переносим целиком. */
const PLAIN_TABLES = ['order', 'address', 'aiChat', 'greenBoxSubscription'] as const;

/** Таблицы с `@@unique([userId, productId])` — переносим с оглядкой. */
const PRODUCT_TABLES = ['cartItem', 'favorite', 'review'] as const;

/**
 * Свести два аккаунта в один. Идемпотентно: повторный вызов с тем же
 * человеком ничего не меняет, потому что второго аккаунта уже нет.
 *
 * Всё в одной транзакции: половина перенесённой истории хуже, чем два
 * честных аккаунта.
 */
export async function mergeUsers(idA: string, idB: string): Promise<MergeResult> {
  if (idA === idB) {
    const only = await prisma.user.findUnique({ where: { id: idA } });
    return { keptId: idA, removedId: null, bonusPoints: only?.bonusPoints ?? 0 };
  }

  const pair = await prisma.user.findMany({
    where: { id: { in: [idA, idB] } },
    orderBy: { createdAt: 'asc' },
  });
  if (pair.length < 2) {
    const survivor = pair[0];
    return {
      keptId: survivor?.id ?? idA,
      removedId: null,
      bonusPoints: survivor?.bonusPoints ?? 0,
    };
  }

  const [keep, drop] = pair;
  const bonusPoints = keep.bonusPoints + drop.bonusPoints;

  await prisma.$transaction(async (tx) => {
    for (const table of PLAIN_TABLES) {
      const model = tx[table] as unknown as {
        updateMany: (args: Prisma.OrderUpdateManyArgs) => Promise<unknown>;
      };
      await model.updateMany({ where: { userId: drop.id }, data: { userId: keep.id } });
    }

    for (const table of PRODUCT_TABLES) {
      const model = tx[table] as unknown as {
        findMany: (args: object) => Promise<{ id: string; productId: string }[]>;
        updateMany: (args: object) => Promise<unknown>;
        deleteMany: (args: object) => Promise<unknown>;
      };
      const mine = await model.findMany({
        where: { userId: keep.id },
        select: { id: true, productId: true },
      });
      const taken = new Set(mine.map((row) => row.productId));
      const theirs = await model.findMany({
        where: { userId: drop.id },
        select: { id: true, productId: true },
      });
      const movable = theirs.filter((row) => !taken.has(row.productId)).map((row) => row.id);
      if (movable.length) {
        await model.updateMany({ where: { id: { in: movable } }, data: { userId: keep.id } });
      }
      await model.deleteMany({ where: { userId: drop.id } });
    }

    // Карточка CRM указывает на аккаунт витрины обычной колонкой без внешнего
    // ключа (`Customer.webUserId`), поэтому Prisma её не перевесит сама — а
    // именно на неё смотрит начисление бонусов из админки.
    await tx.customer.updateMany({
      where: { webUserId: drop.id },
      data: { webUserId: null },
    });

    // Удаляем ПЕРЕД обновлением: телефон и telegramId уникальны, и пока
    // второй аккаунт жив, перенести их на выжившего нельзя — Postgres
    // отвечает 23505 на unique-индексе. Значения второго аккаунта уже
    // считаны в `drop`, поэтому удаление ничего не теряет.
    //
    // Дочерние строки к этому моменту уже перевешены: у Order и
    // GreenBoxSubscription нет каскада, и удаление владельца упало бы на
    // внешнем ключе.
    await tx.user.delete({ where: { id: drop.id } });

    await tx.user.update({
      where: { id: keep.id },
      data: {
        bonusPoints,
        // Пропуски выжившего закрываем данными второго: у одного мог быть
        // только телефон, у другого — только Telegram.
        phone: keep.phone ?? drop.phone,
        telegramId: keep.telegramId ?? drop.telegramId,
        firstName: keep.firstName ?? drop.firstName,
        lastName: keep.lastName ?? drop.lastName,
        username: keep.username ?? drop.username,
        avatarUrl: keep.avatarUrl ?? drop.avatarUrl,
      },
    });
  });

  return { keptId: keep.id, removedId: drop.id, bonusPoints };
}

/**
 * Привязать Telegram к аккаунту, слив дубль, если этот Telegram уже занят.
 *
 * Возвращает id аккаунта, которым следует пользоваться дальше: он может
 * отличаться от переданного, если выжил более старый.
 */
export async function linkTelegram(userId: string, telegramId: bigint): Promise<string> {
  const holder = await prisma.user.findUnique({ where: { telegramId } });

  if (holder && holder.id !== userId) {
    const merged = await mergeUsers(userId, holder.id);
    return merged.keptId;
  }

  if (!holder) {
    await prisma.user.update({ where: { id: userId }, data: { telegramId } });
  }
  return userId;
}
