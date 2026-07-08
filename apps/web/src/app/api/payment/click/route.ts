import { NextRequest, NextResponse } from 'next/server';
import { md5, findOrderByRef, markOrderPaid } from '@/lib/payments';

// ==========================================
// Click Shop API webhook — Prepare (action=0) + Complete (action=1).
// Docs: https://docs.click.uz/en/click-api-request/
// merchant_trans_id is the order reference set at checkout (order id / number).
// The order is marked PAID only on a valid Complete with a correct signature.
// ==========================================

const SERVICE_ID = process.env.CLICK_SERVICE_ID || '';
const SECRET_KEY = process.env.CLICK_SECRET_KEY || '';

export async function POST(request: NextRequest) {
  // Click posts application/x-www-form-urlencoded (accept JSON too, for tests).
  const p: Record<string, string> = {};
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      Object.assign(p, await request.json());
    } else {
      (await request.formData()).forEach((v, k) => { p[k] = String(v); });
    }
  } catch { /* fall through — validation below rejects empty payloads */ }

  const action = String(p.action ?? '');
  const reply = (extra: Record<string, unknown>, error = 0, note = 'Success') =>
    NextResponse.json({
      click_trans_id: Number(p.click_trans_id) || 0,
      merchant_trans_id: p.merchant_trans_id || '',
      error,
      error_note: note,
      ...extra,
    });

  // Not configured → never touch money-state; just tell Click we can't serve it.
  if (!SECRET_KEY || !SERVICE_ID) {
    console.warn('Click webhook: keys not configured — refusing to confirm payment');
    return reply({}, -8, 'Payment provider not configured');
  }

  // Signature validation (MD5). Complete additionally binds merchant_prepare_id.
  const base = action === '1'
    ? `${p.click_trans_id}${p.service_id}${SECRET_KEY}${p.merchant_trans_id}${p.merchant_prepare_id}${p.amount}${p.action}${p.sign_time}`
    : `${p.click_trans_id}${p.service_id}${SECRET_KEY}${p.merchant_trans_id}${p.amount}${p.action}${p.sign_time}`;
  if (!p.sign_string || md5(base) !== p.sign_string) {
    return reply({}, -1, 'SIGN CHECK FAILED');
  }

  const order = await findOrderByRef(p.merchant_trans_id);
  if (!order) return reply({}, -5, 'Order not found');
  if (Math.round(Number(p.amount)) !== order.total) {
    return reply({}, -2, 'Incorrect amount');
  }
  if (Number(p.error) < 0) {
    return reply({}, -9, 'Transaction cancelled by Click');
  }

  if (action === '0') {
    // Prepare — confirm we can accept payment for this order.
    if (order.paymentStatus === 'PAID') return reply({}, -4, 'Already paid');
    return reply({ merchant_prepare_id: Number(p.click_trans_id) || Date.now() });
  }

  if (action === '1') {
    // Complete — money received. Idempotent inside markOrderPaid.
    await markOrderPaid(order.id);
    return reply({ merchant_confirm_id: Number(p.merchant_prepare_id) || Date.now() });
  }

  return reply({}, -3, 'Action not found');
}
