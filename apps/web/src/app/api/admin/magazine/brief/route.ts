import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { generateJSON, aiProvider } from '@/lib/magazine/ai';

export const dynamic = 'force-dynamic';

// ════════════════════════════════════════════════════════════
// «Брифинг недели» — сырьё для сборки журнала: темы, новости, статистика.
// Владелец копирует нужное в слоты. Каждый источник в try/catch —
// отказ одного не роняет ответ (graceful degradation).
// ════════════════════════════════════════════════════════════

const WEB_OFFICE_URL = process.env.WEB_OFFICE_URL || 'http://localhost:8050';

// Проверены на реальную отдачу <item> (parity с apps/tgas/shared/trends.py)
const RSS_FEEDS = [
  'https://www.gazeta.uz/ru/rss/',
  'https://podrobno.uz/rss/',
];

// Парс заголовков из RSS (первый <title> — канал, его пропускаем)
async function fetchRssTitles(url: string, limit = 4): Promise<string[]> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'FreshWeekly/1.0' } });
    if (!res.ok) return [];
    const xml = await res.text();
    const titles: string[] = [];
    // RSS <item> и Atom <entry>; <title> может иметь атрибуты и CDATA
    const re = /<(?:item|entry)[\s\S]*?<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) && titles.length < limit) {
      const t = m[1].replace(/<[^>]+>/g, '').trim();
      if (t) titles.push(t);
    }
    return titles;
  } catch {
    return [];
  }
}

async function getWeather(): Promise<string> {
  try {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=39.65&longitude=66.96&current=temperature_2m,weather_code&timezone=Asia/Samarkand', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return '';
    const d = await res.json();
    const c = d.current;
    return `Самарканд: ${Math.round(c.temperature_2m)}°C`;
  } catch {
    return '';
  }
}

function getSeason(): string {
  const mo = new Date().getMonth() + 1;
  if (mo >= 3 && mo <= 5) return 'Весна';
  if (mo >= 6 && mo <= 8) return 'Лето';
  if (mo >= 9 && mo <= 11) return 'Осень';
  return 'Зима';
}

// Реальные Google Trends из tgas (опц., graceful fallback)
async function fetchTgasTrends(): Promise<string[]> {
  try {
    const res = await fetch(`${WEB_OFFICE_URL}/api/magazine/brief`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const d = await res.json();
    return Array.isArray(d.google_trends) ? d.google_trends.slice(0, 10) : [];
  } catch {
    return [];
  }
}

// Идеи тем по секциям от ИИ (OpenAI-first) на базе новостей/сезона
async function generateTopics(news: string[], season: string): Promise<Record<string, string>> {
  if (!aiProvider()) return {};
  try {
    const prompt = `Сезон: ${season}. Новости недели:\n${news.slice(0, 6).map((n) => `- ${n}`).join('\n')}\n\nПредложи по ОДНОЙ короткой идее темы (одна фраза, на русском) для секций журнала FRESH WEEKLY. Где уместно — свяжи с микрозеленью/здоровой едой. Верни JSON: {"health": "...", "beauty": "...", "recipe": "...", "tech": "...", "news": "...", "kids": "..."}`;
    return await generateJSON('Ты — главный редактор премиального журнала о еде и здоровье FRESH WEEKLY (Узбекистан).', prompt, { temperature: 0.9, maxTokens: 512 });
  } catch {
    return {};
  }
}

async function getStats() {
  try {
    const [restaurants, products, partnerCount] = await Promise.all([
      prisma.restaurant.findMany({ select: { microgreens: true } }),
      prisma.product.findMany({ where: { isActive: true }, orderBy: { isFeatured: 'desc' }, take: 5, select: { nameRu: true, nameUz: true } }),
      prisma.restaurant.count({ where: { isMagazinePartner: true } }),
    ]);
    const freq: Record<string, number> = {};
    for (const r of restaurants) for (const m of r.microgreens || []) freq[m] = (freq[m] || 0) + 1;
    const topMicrogreens = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
    return {
      topMicrogreens,
      topProducts: products.map((p) => p.nameRu || p.nameUz),
      partnerCount,
      restaurantsTotal: restaurants.length,
    };
  } catch {
    return { topMicrogreens: [], topProducts: [], partnerCount: 0, restaurantsTotal: 0 };
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  const season = getSeason();
  const [newsArrays, weather, googleTrends, stats] = await Promise.all([
    Promise.all(RSS_FEEDS.map((u) => fetchRssTitles(u))),
    getWeather(),
    fetchTgasTrends(),
    getStats(),
  ]);
  const news = newsArrays.flat().slice(0, 10);
  const topics = await generateTopics(news, season);

  return NextResponse.json({
    season,
    weather,
    news,
    googleTrends,
    topics,
    stats,
    generatedAt: new Date().toISOString(),
  });
}
