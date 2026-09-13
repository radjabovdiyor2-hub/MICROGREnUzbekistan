import { afterEach, describe, expect, it, vi } from 'vitest';

import type { QueuedPing } from './pingQueue';
import { classify, PING_PATH, sendPings } from './sendPings';

// Различие «повторить» и «ждать бесполезно» стоит человеку целого дня:
// пачка, которую крутят по минуте, копит очередь до потолка, и вечером
// выясняется, что трека нет. Поэтому оно проверяется, а не подразумевается.

describe('classify', () => {
  it('успех есть успех', () => {
    expect(classify(200).kind).toBe('ok');
    expect(classify(204).kind).toBe('ok');
  });

  it('сессия истекла и доступ закрыт — повтором не лечится', () => {
    expect(classify(401).kind).toBe('rejected');
    expect(classify(403).kind).toBe('rejected');
  });

  it('слова сервера доходят до человека без пересказа', () => {
    // «Совпадают имена сотрудников» чинит владелец, и продавцу надо
    // передать ему ровно эту фразу.
    const r = classify(403, 'Совпадают имена сотрудников — трек некому приписать');
    expect(r.kind === 'rejected' && r.message).toContain('Совпадают имена');
  });

  it('отказ без объяснения всё равно называется словом', () => {
    const r = classify(403, '   ');
    expect(r.kind === 'rejected' && r.message.length > 0).toBe(true);
  });

  it('поломка сервера — повторяем', () => {
    expect(classify(500).kind).toBe('retry');
    expect(classify(502).kind).toBe('retry');
  });

  it('перегрузка и таймаут — повторяем, а не выбрасываем день', () => {
    expect(classify(429).kind).toBe('retry');
    expect(classify(408).kind).toBe('retry');
  });

  it('непонятный код считаем временным', () => {
    // Ошибиться в сторону повтора безопасно: пачка полежит в очереди.
    // Ошибиться в сторону отказа — значит выбросить работу человека.
    expect(classify(418).kind).toBe('retry');
    expect(classify(0).kind).toBe('retry');
  });
});

// ══════════════════════════════════════════════════════════════════════
// Отправка из приложения — родным HTTP.
//
// Через пять минут в фоне Android душит запросы из WebView. Координаты при
// этом копились, а на сервер уходили с опозданием в десятки минут: на
// карте владельца человек «молчал», хотя ехал. Проверяется не сеть, а
// ВЫБОР пути — он и ломается молча.
// ══════════════════════════════════════════════════════════════════════

type NativeRequest = { url: string; method: string; headers: Record<string, string>; data: unknown };
type RequestFn = (options: NativeRequest) => Promise<{ status: number; data: unknown }>;

const PING: QueuedPing = {
  at: 1_757_000_000_000,
  latitude: 39.654,
  longitude: 66.9597,
  accuracyM: 12,
  source: 'app',
  speedMps: null,
  headingDeg: null,
};

/** Страница внутри APK: мост Capacitor с родным HTTP. */
function stubApp(request: RequestFn): void {
  vi.stubGlobal('window', {
    location: { origin: 'https://microgreenuzbekistan.com' },
    Capacitor: {
      isNativePlatform: () => true,
      registerPlugin: (name: string) => (name === 'CapacitorHttp' ? { request } : null),
    },
  });
}

function okFetch() {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendPings в приложении', () => {
  it('с ключом устройства уходит родным запросом, а не fetch', async () => {
    const request = vi.fn<RequestFn>().mockResolvedValue({ status: 200, data: { status: 'ok' } });
    const fetchSpy = okFetch();
    stubApp(request);
    vi.stubGlobal('fetch', fetchSpy);

    const result = await sendPings([PING], 'mgd_key');

    expect(result.kind).toBe('ok');
    expect(fetchSpy).not.toHaveBeenCalled();
    const options = request.mock.calls[0][0];
    // Адрес абсолютный: у родного запроса нет «текущей страницы», и
    // относительный путь ушёл бы в никуда.
    expect(options.url).toBe(`https://microgreenuzbekistan.com${PING_PATH}`);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer mgd_key');
    expect(options.data).toEqual({ pings: [PING] });
  });

  it('отказ родного запроса разбирается так же, как у fetch', async () => {
    const request = vi.fn<RequestFn>().mockResolvedValue({
      status: 403,
      data: { error: 'Совпадают имена сотрудников' },
    });
    stubApp(request);
    vi.stubGlobal('fetch', okFetch());

    const result = await sendPings([PING], 'mgd_key');

    expect(result.kind === 'rejected' && result.message).toContain('Совпадают имена');
  });

  it('без ключа — путём страницы: родной запрос не несёт куку сессии', async () => {
    // Иначе первая пачка смены, ушедшая до выдачи ключа, получила бы 401 —
    // «отказ навсегда», который снимает запись на весь день.
    const request = vi.fn<RequestFn>();
    const fetchSpy = okFetch();
    stubApp(request);
    vi.stubGlobal('fetch', fetchSpy);

    const result = await sendPings([PING], null);

    expect(result.kind).toBe('ok');
    expect(request).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('родной модуль упал — пачка уходит путём страницы, а не крутит повтор', async () => {
    // Приложение старой сборки без модуля иначе отвечало бы `retry` до
    // конца смены, и ни одна крошка не дошла бы до сервера.
    const request = vi.fn<RequestFn>().mockRejectedValue(new Error('UNIMPLEMENTED'));
    const fetchSpy = okFetch();
    stubApp(request);
    vi.stubGlobal('fetch', fetchSpy);

    const result = await sendPings([PING], 'mgd_key');

    expect(result.kind).toBe('ok');
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('в браузере родного пути нет вовсе', async () => {
    const fetchSpy = okFetch();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await sendPings([{ ...PING, source: 'pwa' }], 'mgd_key');

    expect(result.kind).toBe('ok');
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
