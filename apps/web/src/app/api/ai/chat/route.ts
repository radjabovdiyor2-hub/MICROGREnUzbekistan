import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { consume, clientIp, tooManyRequests } from '@/lib/rateLimit';

import { callOpenAI, fallbackResponse } from '@/lib/ai/openaiClient';
import { getWeather, buildStoreContext, buildConditions } from '@/lib/ai/chatHelpers';
import { getSettings } from '@/lib/settings/store';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ==========================================
// POST handler
// ==========================================
export async function POST(request: NextRequest) {
  try {
    // Маршрут открытый и на каждый вызов тратит платные токены OpenAI.
    // 20 сообщений в минуту с адреса — потолок живого диалога.
    const ip = clientIp(request);
    const limit = await consume(`ai:${ip}`, 20, 60 * 1000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { message, history, userId, telegramId, cartItems, image } = await request.json();

    if (!message?.trim() && !image) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    let reply: string;
    let userInfo = '';

    // Витринный бот знает собеседника по Telegram ID, сайт — по cuid.
    //
    // Бот слал свой Telegram ID в поле `userId`, а поиск шёл по первичному
    // ключу: совпадения не было никогда, и модель не знала ни имени клиента,
    // ни языка, ни баланса баллов. Диагностировать это было нечем — ошибку
    // глотал пустой `catch { /* ignore */ }`.
    if (userId || telegramId) {
      try {
        const user = telegramId
          ? await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } })
          : await prisma.user.findUnique({ where: { id: userId } });
        if (user) {
          userInfo = `\nMIJOZ: ${user.firstName || 'Mehmon'} | Til: ${user.language} | Ball: ${user.bonusPoints}`;
        }
      } catch (error) {
        console.error('[AI chat] Не удалось определить клиента:', error);
      }
    }

    if (cartItems && cartItems.length > 0) {
      const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
      const cartList = cartItems.map((i: { name: string; price: number; qty: number }) =>
        `${i.name} ×${i.qty} = ${fmt(i.price * i.qty)}`
      ).join(', ');
      userInfo += `\nSAVAT: ${cartList}. Mos qo'shimcha mahsulotlarni tavsiya et.`;
    }

    // Add weather context
    const weather = await getWeather();
    if (weather) userInfo += `\n${weather}`;

    // Weather fallback shortcut
    if (/ob.havo|погод|weather|beton quy|bugun.*ish/i.test(message || '')) {
      if (!OPENAI_API_KEY || OPENAI_API_KEY.length <= 10) {
        return NextResponse.json({ reply: weather || "Ob-havo ma'lumotini yuklab bo'lmadi. Keyinroq urinib ko'ring.", source: 'local', timestamp: new Date().toISOString() });
      }
    }

    if (OPENAI_API_KEY && OPENAI_API_KEY.length > 10) {
      try {
        const [storeContext, conditions] = await Promise.all([
          buildStoreContext(),
          buildConditions(),
        ]);
        reply = await callOpenAI(message || 'Bu rasmni tahlil qil', history || [], storeContext, conditions, userInfo, image);
      } catch (error) {
        console.error('OpenAI fallback:', error);
        reply = await fallbackResponse(message || '');
      }
    } else {
      reply = await fallbackResponse(message || '');
    }

    return NextResponse.json({
      reply,
      source: OPENAI_API_KEY ? 'openai' : 'local',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('AI chat error:', error);
    // Телефон — из настроек. Здесь литералом стоял третий по счёту номер,
    // не совпадавший ни с одним из двух в промпте.
    let phone = '';
    try {
      phone = String((await getSettings())['contacts.phonePrimary'] || '');
    } catch { /* настройки недоступны — обойдёмся без номера */ }
    const call = phone ? ` yoki ${phone} ga qo'ng'iroq qiling` : '';
    const callRu = phone ? ` или позвоните ${phone}` : '';
    return NextResponse.json({
      reply: `Voy, nimadur xato ketdi! 😅 Qayta urinib ko'ring${call}.\n\nУпс, что-то пошло не так! 😅 Попробуйте еще раз${callRu}.`,
      source: 'error',
    });
  }
}
