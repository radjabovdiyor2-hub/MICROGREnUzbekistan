import { timeoutSignal } from '@/lib/net/connection';

import type { QueuedPing } from './pingQueue';

// ══════════════════════════════════════════════════════════════════════
// Отправка пачки крошек и — главное — разбор отказа.
//
// ЗАЧЕМ ОТДЕЛЬНЫМ МОДУЛЕМ. Различие «повторить» и «ждать бесполезно»
// выглядит мелочью, а стоит человеку целого дня. Сотрудника уволили,
// сессия истекла, его имя совпало с именем второго Азиза — сервер
// отвечает отказом, который не лечится повтором. Хук, крутящий такую
// пачку по минуте, молча копит очередь до потолка, и вечером выясняется,
// что трека нет вовсе. Поэтому решение вынесено сюда и покрыто тестами.
// ══════════════════════════════════════════════════════════════════════

export type SendResult =
  | { kind: 'ok' }
  /** Временная беда: сервер перезагружался, связь моргнула. Повторим. */
  | { kind: 'retry' }
  /** Отказ по сути. Чинит владелец, а не повтор запроса. */
  | { kind: 'rejected'; message: string };

/**
 * Что означает этот код ответа.
 *
 * 401 и 403 — единственные окончательные. Всё остальное, включая
 * непонятное, считаем временным: ошибиться в сторону повтора безопасно
 * (пачка полежит в очереди), а в сторону отказа — значит выбросить день.
 */
export function classify(status: number, message?: string): SendResult {
  if (status >= 200 && status < 300) return { kind: 'ok' };
  if (status === 401 || status === 403) {
    return { kind: 'rejected', message: message?.trim() || 'Сервер не принимает трек' };
  }
  return { kind: 'retry' };
}

/**
 * Отдать пачку. Сеть не бросает наружу: обрыв — это `retry`.
 *
 * `deviceKey` — ключ приложения. Есть он только в APK, и нужен ровно
 * потому, что родная служба будит приложение через сутки после того, как
 * человек последний раз смотрел на экран: сессии к этому моменту нет, и
 * пачка ушла бы в 401 — то есть в «отказ навсегда», хотя человек работает.
 */
export async function sendPings(
  pings: QueuedPing[],
  deviceKey?: string | null,
): Promise<SendResult> {
  try {
    const res = await fetch('/api/admin/tracking/ping', {
      method: 'POST',
      headers: deviceKey
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceKey}` }
        : { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pings }),
      // На слабой связи запрос не отказывает, а молчит минутами и держит
      // канал, по которому уходит фотоотчёт. Оборвать честнее.
      signal: timeoutSignal(),
    });
    if (res.ok) return { kind: 'ok' };
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return classify(res.status, body?.error);
  } catch {
    return { kind: 'retry' };
  }
}
