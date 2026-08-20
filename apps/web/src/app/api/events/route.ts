import { NextRequest } from 'next/server';
import { getSession } from '@/lib/adminAuth';
import { subscribe, type ChangeEvent } from '@/lib/realtime/bus';

// ══════════════════════════════════════════════════════════════════════
// Поток изменений для открытых экранов админки (Server-Sent Events).
//
// ЗАЧЕМ
//
// Realtime в витрине не было вовсе: всё «живое» держалось на опросе — пять
// запросов каждые 30 секунд у одного только колокольчика, а у товаров,
// заказов и клиентов не было и опроса. Изменение, сделанное в кассе, в боте
// или в ИИ-офисе, доезжало до открытой админки только по F5.
//
// ПОЧЕМУ SSE, А НЕ WEBSOCKET
//
// Нужен односторонний поток «сервер → экран», и это ровно то, чем SSE и
// является. `EventSource` переподключается сам, новых зависимостей ноль,
// кастомный сервер не нужен — а он сломал бы `output: 'standalone'`, на
// котором собран прод-образ.
//
// ПРО NGINX
//
// `X-Accel-Buffering: no` выключает буферизацию для ЭТОГО ответа. Без него
// прокси копил бы события в буфере и отдавал пачкой — то есть «реальное
// время» приходило бы раз в несколько минут. Заголовком, а не правкой
// конфига: в проде проксирует системный nginx хоста, которого нет в
// репозитории, и требовать доступ к нему ради одной директивы неразумно.
//
// Пинг каждые 25 секунд держит соединение живым под дефолтным
// `proxy_read_timeout 60s` — иначе тихий поток рвался бы раз в минуту.
// ══════════════════════════════════════════════════════════════════════

// Поток живёт минутами: кэшировать нечего, а статический рендер невозможен.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PING_MS = 25_000;

export async function GET(request: NextRequest) {
  // Проверка по роли, а не через `isStaff()`: тот намеренно не пускает
  // агронома (см. adminAuth), и теплица осталась бы единственным экраном
  // без живых обновлений. Здесь нужен любой сотрудник — данных в потоке
  // нет, только имена изменившихся тем.
  const role = getSession(request)?.role;
  if (role !== 'ADMIN' && role !== 'SELLER' && role !== 'GROWER') {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: string) => {
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Поток уже закрыт браузером — отписываемся и уходим тихо.
          // Это норма, а не сбой: вкладку закрывают чаще, чем перезагружают.
          cleanup();
        }
      };

      const cleanup = () => {
        if (ping) clearInterval(ping);
        ping = null;
        unsubscribe?.();
        unsubscribe = null;
      };

      // `retry` — сколько ждать перед переподключением. Браузерный дефолт
      // около 3 секунд; двух достаточно, а разрыв при выкатке новой версии
      // тогда почти не заметен.
      send('retry: 2000\n\n');

      unsubscribe = subscribe((event: ChangeEvent) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      });

      // Комментарий (строка с двоеточия) — легальный кадр SSE, который
      // клиент игнорирует. Нужен ровно для того, чтобы прокси и мобильная
      // сеть не сочли молчащее соединение мёртвым.
      ping = setInterval(() => send(': ping\n\n'), PING_MS);

      request.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // Уже закрыт — гонка отмены с закрытием потока безобидна.
        }
      });
    },
    cancel() {
      if (ping) clearInterval(ping);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
