import { NextRequest, NextResponse } from 'next/server';
import { findPayableByRef, markPayablePaid } from '@/lib/payments';

// ==========================================
// Payme Merchant API webhook (JSON-RPC 2.0).
// Docs: https://developer.help.paycom.uz/protokol-merchant-api/
// Auth: HTTP Basic "Paycom:<PAYME_KEY>". Amount is in tiyin (1 so'm = 100).
//
// NOTE: a fully certified Payme integration needs a transactions table to track
// state across Create/Perform/Cancel by Payme transaction id. This handler maps
// via params.account.order_id (present on Check/Create) and marks the order PAID
// on PerformTransaction. Robust multi-call reconciliation is a follow-up — see
// the integration notes. The order is only ever touched after auth passes.
// ==========================================

const PAYME_KEY = process.env.PAYME_KEY || '';

function authOk(request: NextRequest): boolean {
  if (!PAYME_KEY) return false; // not configured → reject, never confirm blindly
  const h = request.headers.get('authorization') || '';
  if (!h.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8'); // "Paycom:<key>"
    return (decoded.split(':')[1] ?? '') === PAYME_KEY;
  } catch {
    return false;
  }
}

const rpc = (id: unknown, result: Record<string, unknown>) => NextResponse.json({ result, id });
const rpcError = (id: unknown, code: number, message: string) =>
  NextResponse.json({ error: { code, message }, id: id ?? null });

function accountRef(params: Record<string, unknown> | undefined): string | null {
  const acc = (params?.account ?? {}) as Record<string, unknown>;
  const ref = acc.order_id ?? acc.order ?? acc.orderNumber ?? acc.order_number;
  return ref ? String(ref) : null;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = body.id;
  const method = body.method as string | undefined;
  const params = body.params as Record<string, unknown> | undefined;

  if (!authOk(request)) {
    return rpcError(id, -32504, 'Insufficient privileges to perform this operation');
  }

  const ref = accountRef(params);
  const amount = Number(params?.amount) || 0;

  switch (method) {
    case 'CheckPerformTransaction': {
      const payable = ref ? await findPayableByRef(ref) : null;
      if (!payable) return rpcError(id, -31050, 'Order not found');
      if (amount && Math.round(amount / 100) !== payable.amount) {
        return rpcError(id, -31001, 'Incorrect amount');
      }
      if (payable.paid) return rpcError(id, -31051, 'Order already paid');
      return rpc(id, { allow: true });
    }

    case 'CreateTransaction': {
      const payable = ref ? await findPayableByRef(ref) : null;
      if (!payable) return rpcError(id, -31050, 'Order not found');
      return rpc(id, { create_time: Date.now(), transaction: String(params?.id ?? ''), state: 1 });
    }

    case 'PerformTransaction': {
      // Confirm payment — the payable (Order or PrintOrder) must exist to mark it paid.
      const payable = ref ? await findPayableByRef(ref) : null;
      if (!payable) return rpcError(id, -31050, 'Order not found');
      await markPayablePaid(ref as string);
      return rpc(id, { perform_time: Date.now(), transaction: String(params?.id ?? ''), state: 2 });
    }

    case 'CancelTransaction': {
      return rpc(id, { cancel_time: Date.now(), transaction: String(params?.id ?? ''), state: -1 });
    }

    case 'CheckTransaction': {
      return rpc(id, { transaction: String(params?.id ?? ''), state: 2 });
    }

    default:
      return rpcError(id, -32601, 'Method not found');
  }
}
