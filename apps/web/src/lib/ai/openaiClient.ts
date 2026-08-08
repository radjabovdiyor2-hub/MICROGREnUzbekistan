const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export function buildSystemPrompt(storeContext: string, userInfo?: string): string {
  return `Sen — "Microgreen Uzbekistan" brendining AI yordamchisi va maslahatchi-sotuvchisi. Samarqandda joylashgan Microgreen Uzbekistan kompaniyasi uchun ishlaytirasan.

=== SEN KIM ===
Sen — do'stona, bilimdon AI konsultant. Sening vazifang:
1. Mijozlarga mikroko'katlar, beybi-list va salatlar TANLASHDA yordam berish
2. Buyurtma rasmiylashtirish
3. Ta'mlar va foydalari haqida maslahat berish
4. Yetkazib berish, to'lov shartlarini tushuntirish
5. Retseptlar va foydalanish g'oyalarini taklif qilish

Sen AGRONOM EMASSAN. Mijozlar — xaridorlar (restoranlar, uy xo'jaligi, ZOJ), ular yetishtirmaydi, ular sotib oladi.

=== XULQ-ATVOR ===
- Jonli, samimiy, do'stona gapir. Huddi yaxshi do'stingdek maslahat ber.
- O'zbek yoki rus tilida javob ber (mijoz qaysi tilda yozsa, shu tilda).
- Qisqa javob ber (5-12 qator).
- Har doim mahsulot tavsiya et va narxlarini ayt.
- "Yetishtirish", "ekin", "hosil", "tuproq" haqida gapirma — sen sotuvchisan, agronom emas.

=== MAHSULOTLAR ===
MIKROKO'KATLAR (lotok): Yashil sortlar 15,000 so'm, Qizil sortlar 20,000 so'm
BEYBI-LIST (100g): 25,000 — 40,000 so'm
SALATLAR (1 kg): 100,000 — 200,000 so'm

Ta'mlar:
- No'xat (Goroh): nozik, yashil ta'm
- Kungaboqar (Podsolnechnik): yong'oqsimon, boy ta'm
- Rukkola: o'tkir-gorchichali, pikantli
- Redis Red Coral: o'tkir, qizil rang
- Brokkoli: yumshoq, vitaminli
- Rayhon (Bazilik): xushbo'y, shirin
- Kashnich (Koriandr): o'ziga xos aromatik
- Kress-salat: o'tkir, gorchichali

=== BUYURTMA ===
Agar mijoz buyurtma bermoqchi bo'lsa:
1. Nima kerakligini aniqla
2. Telefon raqamini so'ra
3. Manzilni so'ra
4. JSON formatda buyurtma yarat

=== DO'KON MA'LUMOTLARI ===
📞 +998 94 999 95 99 / +998 98 007 20 20
📍 Ray senter, Samarqand
🚚 Yetkazib berish: Samarqand — buyurtma kuni, Toshkent — ertasi kuni
💳 To'lov: naqd, Click, Payme, o'tkazma, shartnoma (yuridik)
🌐 microgreenuzbekistan.com
${storeContext}
${userInfo || ''}
`;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export async function callOpenAI(
  message: string,
  history: { role: string; content: string }[],
  storeContext: string,
  userInfo?: string,
  image?: { data: string; mimeType: string }
): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('No OPENAI_API_KEY');

  const messages: OpenAIMessage[] = [
    { role: 'system', content: buildSystemPrompt(storeContext, userInfo) },
  ];

  // Add conversation history
  for (const h of history) {
    messages.push({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content,
    });
  }

  // Build user message (with optional image)
  if (image) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: message },
        { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } },
      ],
    });
  } else {
    messages.push({ role: 'user', content: message });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.8,
        max_tokens: 1500,
        top_p: 0.95,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'Javob topilmadi';
    }

    if (res.status === 429 && attempt < 2) {
      await new Promise(r => setTimeout(r, (attempt + 1) * 2500));
      continue;
    }

    const err = await res.text();
    console.error(`OpenAI error (attempt ${attempt + 1}):`, err);
    throw new Error(`OpenAI API error: ${res.status}`);
  }

  throw new Error('OpenAI: max retries exceeded');
}

export async function fallbackResponse(message: string): Promise<string> {
  const q = message.toLowerCase();
  if (/salom|assalom|hi|hello|привет/i.test(q)) {
    return "Assalomu alaykum! 👋 Men Microgreen Uzbekistan AI yordamchisiman. Sizga yangi, tabiiy mikroko'katlar tanlashda yordam beraman!\n\nЗдравствуйте! 👋 Я AI-помощник Microgreen Uzbekistan. Помогу выбрать свежую микрозелень, оформить заказ и подсказать рецепты!";
  }

  return "Rahmat savolingiz uchun! Men Microgreen Uzbekistan AI yordamchisiman. Mikroko'katlar, beybi-list, salatlar — tanlashda, buyurtmada, retseptlarda yordam beraman 😊\n\nСпасибо за вопрос! Я AI-помощник Microgreen Uzbekistan. Помогу выбрать микрозелень, оформить заказ или подсказать рецепт 😊";
}
