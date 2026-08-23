import { NextRequest, NextResponse } from 'next/server';

import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { publish, type Topic } from '@/lib/realtime/bus';

// ══════════════════════════════════════════════════════════════════════
// Мост «AI-офис → открытые экраны админки».
//
// ПОЧЕМУ ОН НУЖЕН
//
// Шины две, и они не знали друг о друге. Витрина публикует изменения в свою
// SSE-шину (`lib/realtime/bus`), офис — в Redis/HTTP свою (`event_bus`).
// Пересечения не было ни одного: задача, заведённая в Telegram, не обновляла
// открытую вкладку «Задачи отделам» — владелец смотрел на список, в котором
// её нет, и узнавал об этом перезагрузкой страницы.
//
// Хуже того, тема `'bots'` в перечислении витрины ОБЪЯВЛЕНА и не
// публиковалась никем: экран «Здоровье ботов» опрашивал сервер раз в две
// минуты, потому что сказать ему было некому.
//
// ЧТО ЛЕТИТ
//
// Только имя темы — тот же контракт, что и внутри витрины. Не данные:
// клиент, получив «tasks», перезапросит ровно тот срез, на который у него
// есть право. Событие здесь — «сходи проверь», а не «вот тебе значение».
//
// ДОСТУП
//
// Путь лежит под `/api/admin`, то есть закрыт правилом ADMIN в middleware.
// Офис ходит сюда тем же `BOT_SECRET`, что и в остальные свои двери
// (`hasBotSecret` в middleware), — отдельного механизма не заводим.
// ══════════════════════════════════════════════════════════════════════

/** Темы, которые офис вправе объявить изменившимися. */
const TOPICS: readonly Topic[] = [
  'products', 'orders', 'inventory', 'customers', 'tasks', 'growing', 'bots',
];

function isTopic(value: unknown): value is Topic {
  return typeof value === 'string' && (TOPICS as readonly string[]).includes(value);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: { topic?: unknown; topics?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  // Принимаем и одну тему, и список: одно действие офиса часто меняет
  // сразу несколько срезов (продажа — это и заказы, и склад).
  const raw = Array.isArray(body.topics) ? body.topics : [body.topic];
  const topics = raw.filter(isTopic);

  if (!topics.length) {
    return NextResponse.json(
      { error: `Неизвестная тема. Допустимые: ${TOPICS.join(', ')}` },
      { status: 400 },
    );
  }

  for (const topic of topics) publish(topic);

  return NextResponse.json({ status: 'ok', published: topics });
}
