import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ══════════════════════════════════════════════════════════════════════
// Вебхук WhatsApp (Meta).
//
// Здесь стояло `process.env.WHATSAPP_VERIFY_TOKEN || 'microgreen_uz_wa_token_stub'`.
// Значение по умолчанию лежит в репозитории, то есть пока переменная не
// задана, проверку проходит кто угодно, кто прочитал этот файл. Теперь нет
// переменной — нет и верификации: отказ, как в lib/session.ts и botAuth.ts.
//
// POST дополнительно сверяет подпись Meta (X-Hub-Signature-256). Без неё
// «сообщением от клиента» мог прикинуться любой, кто знает адрес вебхука.
// ══════════════════════════════════════════════════════════════════════

/** Сравнение без утечки по времени. Разная длина — сразу мимо. */
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(request: NextRequest) {
  // Webhook verification by Meta (WhatsApp)
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error('WHATSAPP_VERIFY_TOKEN не задан — верификация вебхука отключена');
    return new NextResponse('Forbidden', { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token && safeEq(token, verifyToken)) {
    console.log('WhatsApp Webhook verified!');
    // Return the challenge as plain text
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

/**
 * Подпись тела запроса ключом приложения Meta.
 *
 * Считается по СЫРОМУ телу: любой разбор и повторная сборка JSON меняют
 * байты, и подпись перестаёт сходиться. Поэтому тело читается строкой, а
 * JSON.parse идёт уже после проверки.
 */
function signatureOk(rawBody: string, header: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
  if (!appSecret) {
    console.error('WHATSAPP_APP_SECRET не задан — вебхук WhatsApp закрыт');
    return false;
  }
  if (!header?.startsWith('sha256=')) return false;

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return safeEq(header.slice('sha256='.length), expected);
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (!signatureOk(rawBody, request.headers.get('x-hub-signature-256'))) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const body = JSON.parse(rawBody);

    // Check if it's a WhatsApp status update or message
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages') {
            const value = change.value;

            // Log messages (to be forwarded to Support Bot)
            if (value.messages && value.messages.length > 0) {
              const message = value.messages[0];
              const phone = value.contacts[0].wa_id;

              console.log(`[WhatsApp] New message from ${phone}: ${message.text?.body || 'Attachment'}`);

              // Future: Event bus publish to 'support' bot for processing
              // await event_bus.publish('whatsapp_message', { phone, message });
            }
          }
        }
      }
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    return new NextResponse('Not Found', { status: 404 });
  } catch (error) {
    console.error('WhatsApp Webhook error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
