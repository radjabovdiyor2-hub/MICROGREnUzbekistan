import { prisma } from '@repo/database';
import { getRecipeForDay } from '@/lib/nutrition/recipes';

let weatherCache: { data: string; ts: number } | null = null;

export async function getWeather(): Promise<string> {
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

export async function buildStoreContext(): Promise<string> {
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
