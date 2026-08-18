import type { NextRequest } from 'next/server';
import { audit } from '@/lib/audit';

// Журнал действий по чеку. Вынесено из sale.ts: там осталась запись
// в базу.

export interface AuditInput {
  request: NextRequest;
  saleNumber: string;
  performedBy: string;
  role: string;
  total: number;
  backdated: boolean;
  soldAt: Date;
  backdateReason: string | null;
  priceOverrides: { productId: string; listPrice: number | null; salePrice: number; reason: string | null }[];
  discount: { type: string; value: number; reason: string; applied: number } | null;
}

/**
 * Журнал действий по чеку.
 *
 * Три отдельных события, а не одно на всё: владелец ищет их по-разному —
 * «кто трогал закрытый день», «почему уступили», «сколько скинули». Общая
 * запись со всем сразу не находится ни по одному из этих вопросов.
 */
export function recordAudit(input: AuditInput): void {
  const ip = input.request.headers.get('x-forwarded-for') ?? undefined;
  const common = { actor: input.performedBy, role: input.role, ip, target: input.saleNumber };

  if (input.backdated) {
    audit({
      ...common,
      action: 'pos.sale.backdated',
      meta: { soldAt: input.soldAt.toISOString(), reason: input.backdateReason, total: input.total },
    });
  }

  for (const override of input.priceOverrides) {
    audit({ ...common, action: 'pos.price.override', meta: { ...override } });
  }

  if (input.discount) {
    audit({ ...common, action: 'pos.discount', meta: { ...input.discount } });
  }
}
