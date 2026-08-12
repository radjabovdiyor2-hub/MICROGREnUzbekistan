import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { notifyOfficeCustomer } from '@/lib/office/client';
import { consume, clientIp, tooManyRequests } from '@/lib/rateLimit';
import { respondWithCustomerSession } from '@/lib/customerSession';
import { normalizePhone } from '@/lib/phone';

// ══════════════════════════════════════════════════════════════════════
// Вход по имени и телефону — без подтверждения номера.
//
// Здесь стоял безусловный `upsert` по телефону и ни одного ограничения.
// Из этого следовали две вещи, и обе плохие:
//
//  · чужим номером переписывалось имя существующего клиента — карточка
//    живого покупателя менялась кем угодно, кто знает его телефон;
//  · вызов не был ограничен ничем, а каждый заводил карточку в CRM офиса
//    через notifyOfficeCustomer — то есть перебором номеров CRM засыпалась
//    выдуманными клиентами.
//
// Теперь: существующая запись НЕ меняется, а сессия кабинета выдаётся
// только новому телефону. Номер здесь ничем не подтверждён, поэтому пускать
// по нему в чужую историю заказов нельзя — для существующего аккаунта нужен
// вход через Telegram (api/auth/telegram, api/auth/telegram-webapp), где
// личность доказана подписью. Настоящее решение — SMS-код; до него дверь
// открыта ровно настолько, чтобы новый покупатель мог оформить заказ.
// ══════════════════════════════════════════════════════════════════════

/** 5 регистраций в час на IP — столько же, сколько у выгрузки перс. данных. */
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limit = await consume(`register:${ip}`, LIMIT, WINDOW_MS);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  try {
    const { name, phone } = await request.json();

    if (!name || !phone) {
      return NextResponse.json({ error: 'Name and phone required' }, { status: 400 });
    }

    // Телефон приводится к единому виду (lib/phone). Здесь он обрезался до
    // девяти цифр, а оформление заказа писало номер с «+998» — и один клиент
    // получал два аккаунта, потому что `users.phone` уникален.
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
      return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
    }

    const nameParts = String(name).trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || null;

    const existing = await prisma.user.findUnique({ where: { phone: cleanPhone } });

    // Телефон уже за кем-то числится. Ничего не трогаем и сессию не выдаём:
    // мы не знаем, тот ли это человек. Отвечаем нейтрально — по ответу нельзя
    // отличить занятый номер от свободного, иначе это перебор базы клиентов.
    if (existing) {
      return NextResponse.json({
        success: true,
        requiresTelegramLogin: true,
        user: null,
      });
    }

    const user = await prisma.user.create({
      data: {
        phone: cleanPhone,
        firstName,
        lastName,
        language: 'uz',
      },
    });

    // Register the new customer in the AI-office CRM (best-effort, idempotent).
    await notifyOfficeCustomer(user);

    // Аккаунт только что создан и пуст — выдать по нему сессию безопасно:
    // отбирать у прежнего владельца нечего, владельца ещё не было.
    return respondWithCustomerSession(user.id, {
      success: true,
      user: {
        id: user.id,
        bonusPoints: user.bonusPoints,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    // Отдаём 503 при ошибке БД. Локальный фолбэк для авторизации обрабатывается на клиенте в AuthProvider.
    return NextResponse.json(
      { error: 'Ошибка сервера при регистрации пользователя' },
      { status: 503 },
    );
  }
}
