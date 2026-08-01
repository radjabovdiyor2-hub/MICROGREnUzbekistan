import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getRecipeForDay } from '@/lib/nutrition/recipes';
import { consume, clientIp, tooManyRequests } from '@/lib/rateLimit';

import { callGemini, fallbackResponse } from '@/lib/ai/geminiClient';
import { getWeather, buildStoreContext } from '@/lib/ai/chatHelpers';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ==========================================
// POST handler
// ==========================================
export async function POST(request: NextRequest) {
  try {
    // Маршрут открытый и на каждый вызов тратит платные токены Gemini
    // (а с полем image — ещё и vision). Без лимита это прямой способ
    // сжечь бюджет: 20 сообщений в минуту с адреса — потолок живого диалога.
    const ip = clientIp(request);
    const limit = await consume(`ai:${ip}`, 20, 60 * 1000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { message, history, userId, cartItems, image } = await request.json();

    if (!message?.trim() && !image) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    let reply: string;
    let userInfo = '';

    if (userId) {
      try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user) {
          userInfo = `\nMIJOZ: ${user.firstName || 'Mehmon'} | Til: ${user.language} | Ball: ${user.bonusPoints}`;
        }
      } catch { /* ignore */ }
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
      if (!GEMINI_API_KEY || GEMINI_API_KEY.length <= 10) {
        return NextResponse.json({ reply: weather || "Ob-havo ma'lumotini yuklab bo'lmadi. Keyinroq urinib ko'ring.", source: 'local', timestamp: new Date().toISOString() });
      }
    }

    if (GEMINI_API_KEY && GEMINI_API_KEY.length > 10) {
      try {
        const storeContext = await buildStoreContext();
        reply = await callGemini(message || 'Bu rasmni tahlil qil', history || [], storeContext, userInfo, image);
      } catch (error) {
        console.error('Gemini fallback:', error);
        reply = await fallbackResponse(message || '');
      }
    } else {
      reply = await fallbackResponse(message || '');
    }

    return NextResponse.json({
      reply,
      source: GEMINI_API_KEY ? 'gemini' : 'local',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('AI chat error:', error);
    return NextResponse.json({
      reply: "Voy, nimadur xato ketdi! 😅 Qayta urinib ko'ring yoki +998 94 999 95 99 ga qo'ng'iroq qiling.\n\nУпс, что-то пошло не так! 😅 Попробуйте еще раз или позвоните +998 94 999 95 99.",
      source: 'error',
    });
  }
}
