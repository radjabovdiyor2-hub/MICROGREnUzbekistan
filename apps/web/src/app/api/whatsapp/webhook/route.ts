import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import { notifyAdmin } from '@/lib/notify';
import { notifyOfficeSupport } from '@/lib/office/client';

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

/** Текст сообщения. Вложение текстом не описывается — говорим об этом прямо. */
function readMessage(message: Record<string, unknown>): string {
  const text = (message.text as { body?: string } | undefined)?.body;
  if (text && text.trim()) return text.trim();
  const kind = typeof message.type === 'string' ? message.type : 'вложение';
  return `[${kind} без текста — откройте переписку в WhatsApp]`;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (!signatureOk(rawBody, request.headers.get('x-hub-signature-256'))) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const body = JSON.parse(rawBody);
    if (body.object !== 'whatsapp_business_account') {
      return new NextResponse('Not Found', { status: 404 });
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        const value = change.value ?? {};
        const message = value.messages?.[0];
        if (!message) continue;

        const phone = value.contacts?.[0]?.wa_id ?? null;
        const name = value.contacts?.[0]?.profile?.name ?? null;
        const text = readMessage(message);

        // ⚠️ ЗДЕСЬ БЫЛ `console.log` И КОММЕНТАРИЙ «Future: Event bus».
        //
        // Ссылка на WhatsApp стоит в подвале сайта, то есть клиенты по ней
        // пишут. Их сообщение доходило до сервера, проходило проверку
        // подписи — и оставалось строкой в логе контейнера. Ни ответа, ни
        // записи в CRM, ни сигнала владельцу: обращение существовало ровно
        // до следующего перезапуска.
        //
        // Дверь для этого уже есть и ею пользуется форма поддержки сайта:
        // офис заводит касание в `interactions` и поднимает
        // COMPLAINT_RECEIVED, по которому PM ставит срочную задачу.
        await notifyOfficeSupport({
          name,
          phone,
          message: `WhatsApp: ${text}`,
        });
        await notifyAdmin({
          type: 'info',
          message: `💬 WhatsApp${name ? ` от ${name}` : ''}${phone ? ` (+${phone})` : ''}:\n${text}`,
        });
      }
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    // Meta повторяет доставку, если ответ не 200. Но своё падение мы
    // обязаны видеть: молчаливая пятисотка здесь означает потерянного
    // клиента, который написал и не получил ответа.
    console.error('WhatsApp Webhook error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
