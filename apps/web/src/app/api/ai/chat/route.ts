import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getRecipeForDay } from '../nutrition/route';
import { consume, clientIp, tooManyRequests } from '@/lib/rateLimit';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// ==========================================
// Weather for Samarkand (39.65, 66.96)
// ==========================================
let weatherCache: { data: string; ts: number } | null = null;

async function getWeather(): Promise<string> {
  // Cache for 30 minutes
  if (weatherCache && Date.now() - weatherCache.ts < 30 * 60 * 1000) {
    return weatherCache.data;
  }
  try {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=39.65&longitude=66.96&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Asia/Samarkand', { next: { revalidate: 1800 } });
    if (!res.ok) return '';
    const d = await res.json();
    const c = d.current;
    const codes: Record<number, string> = { 0: 'Ochiq ☀️', 1: 'Ozgina bulutli 🌤', 2: 'Bulutli ⛅', 3: 'Bulutli ☁️', 45: 'Tuman 🌫', 51: 'Yengil yomgir 🌦', 61: 'Yomgir 🌧', 63: 'Kuchli yomgir ⛈', 71: 'Qor ❄️', 80: 'Jala 🌧', 95: 'Momaqaldiroq ⛈' };
    const weather = codes[c.weather_code] || 'Noma\'lum';
    const advice = c.temperature_2m < 5
      ? '❄️ Sovuq! Ochiq havoda ekish MUMKIN EMAS!'
      : c.weather_code >= 51
        ? '🌧 Yomgirli! Tashqi ekinlar uchun xavfli bo\'lishi mumkin'
        : c.temperature_2m > 35
          ? '🔥 Juda issiq! O\'simliklar kuyishi mumkin — tez-tez sug\'oring'
          : '✅ Ekish ishlari uchun yaxshi ob-havo';

    const text = `OB-HAVO (Samarqand, hozir): ${c.temperature_2m}°C, ${weather}, shamol ${c.wind_speed_10m} km/s, namlik ${c.relative_humidity_2m}%\nMASLAHAT: ${advice}`;
    weatherCache = { data: text, ts: Date.now() };
    return text;
  } catch { return ''; }
}

// ==========================================
// Store context builder
// ==========================================
async function buildStoreContext(): Promise<string> {
  try {
    const [products, categories] = await Promise.all([
      prisma.product.findMany({
        where: { isActive: true },
        include: { category: true },
        orderBy: { isFeatured: 'desc' },
        take: 25,
      }),
      prisma.category.findMany({ orderBy: { order: 'asc' } }),
    ]);

    const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
    const prodList = products.map(p => {
      const sale = p.oldPrice ? ` ❌${fmt(p.oldPrice)}` : '';
      const stock = p.stock > 0 ? '✅' : '❌sold';
      return `${p.nameUz} | ${p.brand || '-'} | ${fmt(p.price)}${sale} | ${stock} | ${p.category?.nameUz || ''}`;
    }).join('\n');

    // Bugungi "retsept dini" — AI-nutritsiolog tavsiya qila oladi (bir manba).
    let recipeLine = '';
    try {
      const r = await getRecipeForDay() as { nameUz?: string; nameRu?: string };
      if (r?.nameRu) recipeLine = `\n\nBUGUNGI RETSEPT (mijozga tavsiya qilishing mumkin): ${r.nameUz} / ${r.nameRu}`;
    } catch { /* recipe is optional context */ }

    return `\nMicrogreen KATALOG (${products.length} mahsulot):\n${prodList}\n\nKATEGORIYALAR: ${categories.map(c => c.nameUz).join(', ')}${recipeLine}`;
  } catch (error) {
    console.error('Store context build error:', error);
    return '';
  }
}

// ==========================================
// MEGA SYSTEM PROMPT — Expert for AgroTech
// ==========================================
function buildSystemPrompt(storeContext: string, userInfo?: string): string {
  return `Sen — "Microgreen Agro", Samarqandning eng aqlli AI maslahatchi-agronomi.

=== SEN KIM ===
Sen ChatGPT darajasidagi universal AI suhbatdoshsan. Sening asosiy kuchli tomonlaring:
mikroko'katlar yetishtirish, gidroponika, urug'lar parvarishi, o'g'itlar (pH, EC), va vertikal fermerchilik.

=== XULQ-ATVOR ===
- Jonli, samimiy, do'stona gapir. Huddi tajribali agronom do'stingdek.
- O'zbek yoki rus tilida javob ber.
- Qisqa javob ber (5-12 qator).

=== AGRONOM REJIMI ===
1. MUAMMONI TUSHUNTIR (kasallik, chirish, o'smayotganligi)
2. YECHIM (suvni almashtirish, yorug'likni kamaytirish, pH to'g'rilash)
3. MATERIALLAR (Microgreen katalogidan urug' yoki o'g'it tavsiya et)

=== DO'KON MA'LUMOTLARI ===
📞 +998 94 999 95 99 / +998 98 007 20 20
📍 Ray senter, Samarqand
${storeContext}
${userInfo || ''}
`;
}

// ==========================================
// Gemini API — with retry for 429
// ==========================================
async function callGemini(
  message: string,
  history: { role: string; content: string }[],
  storeContext: string,
  userInfo?: string,
  image?: { data: string; mimeType: string }
): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('No API key');

  const contents = history.map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }],
  }));

  const parts: any[] = [{ text: message }];
  if (image) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }
  contents.push({ role: 'user', parts });

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: buildSystemPrompt(storeContext, userInfo) }] },
    contents,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 1500,
      topP: 0.95,
    },
  });

  // Retry logic for 429
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (res.ok) {
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Javob topilmadi';
    }

    if (res.status === 429 && attempt < 2) {
      await new Promise(r => setTimeout(r, (attempt + 1) * 2500));
      continue;
    }

    const err = await res.text();
    console.error(`Gemini error (attempt ${attempt + 1}):`, err);
    throw new Error(`Gemini API error: ${res.status}`);
  }

  throw new Error('Gemini: max retries exceeded');
}

// ==========================================
// Smart fallback — natural + expert responses
// ==========================================
async function fallbackResponse(message: string): Promise<string> {
  const q = message.toLowerCase();
  if (/salom|assalom|hi|hello|привет/i.test(q)) {
    return "Assalomu alaykum! 👋 Men Microgreen Agro AI maslahatchiman. Sizga mikroko'katlar yetishtirishda qanday yordam bera olaman?\n\nЗдравствуйте! 👋 Я AI-консультант Microgreen Agro. Как я могу помочь вам с выращиванием микрозелени?";
  }

  return "Rahmat savolingiz uchun! Men Microgreen Agro AI maslahatchiman. Mikroko'katlar, gidroponika yoki urug'lar haqida so'rashingiz mumkin 😊\n\nСпасибо за вопрос! Я AI-консультант Microgreen Agro. Вы можете спросить меня о микрозелени, гидропонике или семенах 😊";
}

// ==========================================
// POST handler
// ==========================================
export async function POST(request: NextRequest) {
  try {
    // Маршрут открытый и на каждый вызов тратит платные токены Gemini
    // (а с полем image — ещё и vision). Без лимита это прямой способ
    // сжечь бюджет: 20 сообщений в минуту с адреса — потолок живого диалога.
    const ip = clientIp(request);
    const limit = consume(`ai:${ip}`, 20, 60 * 1000);
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
