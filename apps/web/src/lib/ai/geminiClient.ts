const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export function buildSystemPrompt(storeContext: string, userInfo?: string): string {
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

export async function callGemini(
  message: string,
  history: { role: string; content: string }[],
  storeContext: string,
  userInfo?: string,
  image?: { data: string; mimeType: string }
): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('No API key');

  const contents: { role: string; parts: GeminiPart[] }[] = history.map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }],
  }));

  const parts: GeminiPart[] = [{ text: message }];
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

export async function fallbackResponse(message: string): Promise<string> {
  const q = message.toLowerCase();
  if (/salom|assalom|hi|hello|привет/i.test(q)) {
    return "Assalomu alaykum! 👋 Men Microgreen Agro AI maslahatchiman. Sizga mikroko'katlar yetishtirishda qanday yordam bera olaman?\n\nЗдравствуйте! 👋 Я AI-консультант Microgreen Agro. Как я могу помочь вам с выращиванием микрозелени?";
  }

  return "Rahmat savolingiz uchun! Men Microgreen Agro AI maslahatchiman. Mikroko'katlar, gidroponika yoki urug'lar haqida so'rashingiz mumkin 😊\n\nСпасибо за вопрос! Я AI-консультант Microgreen Agro. Вы можете спросить меня о микрозелени, гидропонике или семенах 😊";
}
