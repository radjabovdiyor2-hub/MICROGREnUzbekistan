import { OPENAI_MODEL, tokenLimitParams } from './models';
import { recordAiUsage } from './usage';
import { getSetting } from '@/lib/settings/store';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Системный промпт ассистента витрины.
 *
 * `conditions` — контакты, доставка и оплата из настроек; `storeContext` —
 * живой каталог из базы (`buildStoreContext`). Ни того, ни другого в тексте
 * промпта быть не должно: раньше здесь строкой стояли прайс, два телефона и
 * адрес «Ray senter», и модель получала два противоречащих прайса сразу —
 * захардкоженный и настоящий.
 */
export function buildSystemPrompt(storeContext: string, conditions: string, userInfo?: string): string {
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
- Har doim mahsulot tavsiya et.
- "Yetishtirish", "ekin", "hosil", "tuproq" haqida gapirma — sen sotuvchisan, agronom emas.

=== NARXLAR ===
- Narxni FAQAT quyidagi katalogdan ol. O'zingdan narx o'ylab topma va yaxlitlama.
- Katalogda yo'q mahsulot uchun narx aytma — menejerdan aniqlashni taklif qil.

=== TA'MLAR (narxsiz — narx katalogdan) ===
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
${conditions}
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
  conditions: string,
  userInfo?: string,
  image?: { data: string; mimeType: string }
): Promise<string> {
  // ── Рубильник ИИ ──────────────────────────────────────────────────
  //
  // Владелец выключил ИИ в настройках — не идём в модель вовсе. Бросаем,
  // а не возвращаем пустую строку: вызывающий (api/ai/chat) уже умеет
  // ловить отказ и подставлять `fallbackResponse`, то есть честный
  // ответ с телефоном менеджера.
  //
  // Флаг тот же, что читают боты офиса, и лежит в той же таблице
  // app_settings: выключатель обязан быть ОДИН, иначе выключенный в
  // админке ИИ продолжал бы отвечать с витрины.
  if (!(await getSetting('ai.enabled'))) {
    throw new Error('AI disabled by owner');
  }

  if (!OPENAI_API_KEY) throw new Error('No OPENAI_API_KEY');

  const messages: OpenAIMessage[] = [
    { role: 'system', content: buildSystemPrompt(storeContext, conditions, userInfo) },
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
        // Лимит токенов зависит от семейства модели (см. lib/ai/models.ts):
        // рассуждающие отвергают `max_tokens` с ошибкой 400.
        ...tokenLimitParams(OPENAI_MODEL, 1500),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      // Расход витрины раньше выбрасывался вместе с `data.usage`, и админка
      // показывала только траты офиса. Ждать запись не нужно — ответ клиенту
      // важнее, а `recordAiUsage` не бросает.
      void recordAiUsage({
        bot: 'storefront_web',
        model: data.model || OPENAI_MODEL,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      });
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
