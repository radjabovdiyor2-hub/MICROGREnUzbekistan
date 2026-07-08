import crypto from 'crypto';
import { prisma } from '@repo/database';
import { syncOrderPaid } from './orderSync';

// ==========================================
// Payment webhook helpers (Click / Payme).
// SAFETY: an order is only ever marked PAID after a provider webhook passes
// signature/auth validation with configured keys. If keys are unset the routes
// must NOT call markOrderPaid — never flip money-state on an unverified request.
// ==========================================

export function md5(s: string): string {
  return crypto.createHash('md5').update(s).digest('hex');
}

// The provider reference (Click merchant_trans_id / Payme account.order_id) is
// set at checkout to either the order id (cuid) or its human order number.
export async function findOrderByRef(ref: string) {
  if (!ref) return null;
  const byId = await prisma.order.findUnique({ where: { id: ref } });
  if (byId) return byId;
  return prisma.order.findUnique({ where: { orderNumber: ref } });
}

// Idempotently mark an order paid and fire the side-effects (customer DM + office).
export async function markOrderPaid(ref: string) {
  const found = await findOrderByRef(ref);
  if (!found) return null;
  if (found.paymentStatus === 'PAID') return found; // already done — no double notify

  const order = await prisma.order.update({
    where: { id: found.id },
    data: {
      paymentStatus: 'PAID',
      // Move a still-pending order forward; don't rewind a later status.
      status: found.status === 'PENDING' ? 'CONFIRMED' : found.status,
    },
    include: { user: { select: { telegramId: true, language: true } } },
  });

  await syncOrderPaid(order);
  return order;
}
