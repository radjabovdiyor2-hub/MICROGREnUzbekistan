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

// ==========================================
// Unified payable resolution — storefront Order OR magazine PrintOrder (тираж).
// Provider reference convention: PrintOrder uses "print_<id>"; any other ref is a
// storefront Order (unchanged behaviour). This lets the SAME Click/Payme webhooks
// serve both without touching the storefront money-path.
// ==========================================
const PRINT_REF_PREFIX = 'print_';

export interface Payable {
  kind: 'order' | 'print';
  id: string;
  amount: number; // сумма к оплате в сумах (UZS)
  paid: boolean;
}

export async function findPayableByRef(ref: string): Promise<Payable | null> {
  if (!ref) return null;
  if (ref.startsWith(PRINT_REF_PREFIX)) {
    const id = ref.slice(PRINT_REF_PREFIX.length);
    const po = await prisma.printOrder.findUnique({ where: { id } });
    if (!po) return null;
    return { kind: 'print', id: po.id, amount: po.revenue, paid: po.status === 'paid' };
  }
  const order = await findOrderByRef(ref);
  if (!order) return null;
  return { kind: 'order', id: order.id, amount: order.total, paid: order.paymentStatus === 'PAID' };
}

// Idempotently mark a payable (Order or PrintOrder) paid, by its provider reference.
export async function markPayablePaid(ref: string) {
  if (ref && ref.startsWith(PRINT_REF_PREFIX)) {
    const id = ref.slice(PRINT_REF_PREFIX.length);
    const po = await prisma.printOrder.findUnique({ where: { id } });
    if (!po) return null;
    if (po.status === 'paid') return po; // idempotent
    return prisma.printOrder.update({
      where: { id },
      data: { status: 'paid', paidAt: new Date() },
    });
  }
  // storefront order — reuse the existing money-path (customer DM + office sync)
  return markOrderPaid(ref);
}
