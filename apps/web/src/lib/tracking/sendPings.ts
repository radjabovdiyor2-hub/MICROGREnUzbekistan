import { isNativeApp, nativePlugin } from '@/lib/native/bridge';
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
//
// В ПРИЛОЖЕНИИ — РОДНЫМ HTTP. Через пять минут в фоне Android душит
// запросы из WebView (так прямо сказано в документации модуля фоновой
// геопозиции). Координаты при этом продолжали копиться, а на сервер
// уходили с опозданием в десятки минут — и на карте владельца человек
// «молчал», хотя ехал. Родной запрос этого ограничения не знает.
// ══════════════════════════════════════════════════════════════════════

export type SendResult =
  | { kind: 'ok' }
  /** Временная беда: сервер перезагружался, связь моргнула. Повторим. */
  | { kind: 'retry' }
  /** Отказ по сути. Чинит владелец, а не повтор запроса. */
  | { kind: 'rejected'; message: string };

/** Приёмник крошек. */
export const PING_PATH = '/api/admin/tracking/ping';

/**
 * Сколько ждать родной запрос.
 *
 * Меньше минутного интервала отправки: иначе на плохой связи запросы
 * наслаивались бы один на другой.
 */
const NATIVE_TIMEOUT_MS = 20_000;

/** То немногое из родного HTTP оболочки, чем пользуемся. */
interface NativeHttp {
  request(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    data: unknown;
    connectTimeout: number;
    readTimeout: number;
  }): Promise<{ status: number; data: unknown }>;
}

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

/** Текст отказа из тела ответа, если сервер его дал. */
function errorOf(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const value = (data as Record<string, unknown>).error;
  return typeof value === 'string' ? value : undefined;
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
  const headers: Record<string, string> = deviceKey
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceKey}` }
    : { 'Content-Type': 'application/json' };
  const body = { pings };

  // РОДНОЙ HTTP — ТОЛЬКО С КЛЮЧОМ УСТРОЙСТВА. Родной запрос не несёт куку
  // сессии страницы, и без ключа он ушёл бы в 401 — то есть в «отказ
  // навсегда», который снимает запись. Первая пачка смены иногда уходит
  // раньше, чем выдан ключ; она идёт путём страницы, а в этот момент
  // человек как раз смотрит на экран, и душить запрос некому.
  const http = deviceKey && isNativeApp() ? nativePlugin<NativeHttp>('CapacitorHttp') : null;
  if (http) {
    const native = await sendNative(http, body, headers);
    if (native !== null) return native;
  }
  return sendFetch(body, headers);
}

/**
 * Родной запрос. `null` — модуль не ответил вовсе: сборка без него или он
 * упал до сети. Тогда отправляем путём страницы, а не повторяем впустую —
 * иначе старое приложение крутило бы `retry` до конца смены.
 */
async function sendNative(
  http: NativeHttp,
  body: { pings: QueuedPing[] },
  headers: Record<string, string>,
): Promise<SendResult | null> {
  try {
    const res = await http.request({
      url: `${window.location.origin}${PING_PATH}`,
      method: 'POST',
      headers,
      data: body,
      connectTimeout: NATIVE_TIMEOUT_MS,
      readTimeout: NATIVE_TIMEOUT_MS,
    });
    return classify(res.status, errorOf(res.data));
  } catch {
    return null;
  }
}

async function sendFetch(
  body: { pings: QueuedPing[] },
  headers: Record<string, string>,
): Promise<SendResult> {
  try {
    const res = await fetch(PING_PATH, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      // На слабой связи запрос не отказывает, а молчит минутами и держит
      // канал, по которому уходит фотоотчёт. Оборвать честнее.
      signal: timeoutSignal(),
    });
    if (res.ok) return { kind: 'ok' };
    const parsed: unknown = await res.json().catch(() => null);
    return classify(res.status, errorOf(parsed));
  } catch {
    return { kind: 'retry' };
  }
}
