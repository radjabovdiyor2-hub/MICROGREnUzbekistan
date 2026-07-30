import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { findPayableByRef, markPayablePaid } from '@/lib/payments';
import { consume, clientIp, tooManyRequests } from '@/lib/rateLimit';
import crypto from 'crypto';

// ==========================================
// Payme Merchant API webhook (JSON-RPC 2.0).
// Docs: https://developer.help.paycom.uz/protokol-merchant-api/
// Auth: HTTP Basic "Paycom:<PAYME_KEY>". Amount is in tiyin (1 so'm = 100).
//
// Transactions are persisted in payme_transactions for certification:
// Payme requires correct state reporting across Create → Perform / Cancel.
// ==========================================

const PAYME_KEY = process.env.PAYME_KEY || '';

function authOk(request: NextRequest): boolean {
  if (!PAYME_KEY) return false;
  const h = request.headers.get('authorization') || '';
  if (!h.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8');
    const provided = decoded.split(':')[1] ?? '';
    if (provided.length !== PAYME_KEY.length) return false;
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(PAYME_KEY));
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
  const ip = clientIp(request);
  const limit = await consume(`payme:${ip}`, 30, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = body.id;
  const method = body.method as string | undefined;
  const params = body.params as Record<string, unknown> | undefined;

  if (!authOk(request)) {
    return rpcError(id, -32504, 'Insufficient privileges to perform this operation');
  }

  const ref = accountRef(params);
  const amount = Number(params?.amount) || 0;
  const paymeId = String(params?.id ?? '');

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

      // Idempotent: if transaction already exists, return its data.
      const existing = await prisma.paymeTransaction.findUnique({ where: { paymeId } });
      if (existing) {
        if (existing.orderRef !== ref) return rpcError(id, -31050, 'Order mismatch');
        return rpc(id, {
          create_time: existing.createTime.getTime(),
          transaction: existing.paymeId,
          state: existing.state,
        });
      }

      const tx = await prisma.paymeTransaction.create({
        data: {
          paymeId,
          orderRef: ref as string,
          amount,
          state: 1,
        },
      });

      return rpc(id, { create_time: tx.createTime.getTime(), transaction: tx.paymeId, state: 1 });
    }

    case 'PerformTransaction': {
      const tx = await prisma.paymeTransaction.findUnique({ where: { paymeId } });
      if (!tx) return rpcError(id, -31003, 'Transaction not found');
      if (tx.state === 2) {
        return rpc(id, { perform_time: tx.performTime!.getTime(), transaction: tx.paymeId, state: 2 });
      }
      if (tx.state !== 1) return rpcError(id, -31008, 'Transaction cannot be performed');

      await markPayablePaid(tx.orderRef);

      const now = new Date();
      await prisma.paymeTransaction.update({
        where: { paymeId },
        data: { state: 2, performTime: now },
      });

      return rpc(id, { perform_time: now.getTime(), transaction: tx.paymeId, state: 2 });
    }

    case 'CancelTransaction': {
      const tx = await prisma.paymeTransaction.findUnique({ where: { paymeId } });
      if (!tx) return rpcError(id, -31003, 'Transaction not found');
      if (tx.state < 0) {
        return rpc(id, { cancel_time: tx.cancelTime!.getTime(), transaction: tx.paymeId, state: tx.state });
      }

      const reason = Number((params as Record<string, unknown>)?.reason) || 0;
      const cancelState = tx.state === 2 ? -2 : -1;
      const now = new Date();

      await prisma.paymeTransaction.update({
        where: { paymeId },
        data: { state: cancelState, cancelTime: now, reason },
      });

      return rpc(id, { cancel_time: now.getTime(), transaction: tx.paymeId, state: cancelState });
    }

    case 'CheckTransaction': {
      const tx = await prisma.paymeTransaction.findUnique({ where: { paymeId } });
      if (!tx) return rpcError(id, -31003, 'Transaction not found');

      return rpc(id, {
        create_time: tx.createTime.getTime(),
        perform_time: tx.performTime?.getTime() ?? 0,
        cancel_time: tx.cancelTime?.getTime() ?? 0,
        transaction: tx.paymeId,
        state: tx.state,
        reason: tx.reason ?? null,
      });
    }

    default:
      return rpcError(id, -32601, 'Method not found');
  }
}
