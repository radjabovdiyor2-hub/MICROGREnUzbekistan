// ══════════════════════════════════════════════════════════════════════
// Кадр с камеры теплицы через облако EZVIZ — без компьютера на ферме.
//
// ЗАЧЕМ. Первая схема снимала кадр локально: компьютер рядом с камерой,
// ffmpeg, RTSP. Она работает и остаётся запасной, но требует машины,
// которую надо не выключать. У EZVIZ есть дверь, делающая снимок по
// команде через интернет, — тогда снимает наш сервер, и на ферме не нужно
// ничего, кроме включённой камеры.
//
// ЧТО ЭТО НЕ ЕСТЬ. Не видеопоток: облако отдаёт ОДИН кадр на запрос. Для
// стеллажей с растущей зеленью этого довольно, а платить круглосуточным
// перегоном видео за движение, которого нет, незачем.
//
// ХОСТ — ПЕРЕМЕННОЙ, А НЕ КОНСТАНТОЙ. У EZVIZ разные адреса под регионы
// (европейский, американский, китайский), и аккаунт работает только со
// своим. Вписать один в код значит однажды получить «устройство не
// найдено» на исправном устройстве и искать причину в камере.
//
// КЛЮЧИ НЕ ПОПАДАЮТ НИ В ОДНО СООБЩЕНИЕ. Ошибки отсюда уходят в журнал и
// владельцу; `appSecret` в тексте ошибки — это ключ в логах навсегда.
// ══════════════════════════════════════════════════════════════════════

const DEFAULT_HOST = 'https://ieuopen.ezvizlife.com';

export interface EzvizConfig {
  host: string;
  appKey: string;
  appSecret: string;
  deviceSerial: string;
}

/** Настройки из окружения. `null` — интеграция не настроена, и это не ошибка. */
export function readConfig(): EzvizConfig | null {
  const appKey = process.env.EZVIZ_APP_KEY ?? '';
  const appSecret = process.env.EZVIZ_APP_SECRET ?? '';
  const deviceSerial = process.env.EZVIZ_DEVICE_SERIAL ?? '';
  if (!appKey || !appSecret || !deviceSerial) return null;
  return {
    host: process.env.EZVIZ_HOST || DEFAULT_HOST,
    appKey,
    appSecret,
    deviceSerial,
  };
}

/**
 * Ответ облака: успех и отказ приходят ОДНИМ И ТЕМ ЖЕ кодом HTTP.
 *
 * EZVIZ отвечает 200 на «неверный ключ», «устройство офлайн» и «превышен
 * лимит» — разница только в поле `code` внутри тела. Проверять `res.ok`
 * здесь бессмысленно: он всегда истина.
 */
interface EzvizReply<T> {
  code?: string;
  msg?: string;
  data?: T;
}

/** Человеческая причина отказа по коду EZVIZ. */
export function explainCode(code: string, msg?: string): string {
  const known: Record<string, string> = {
    '10001': 'облако не приняло ключи приложения',
    '10002': 'срок ключа доступа истёк — обновится сам на следующем круге',
    '10005': 'ключ приложения заблокирован в кабинете EZVIZ',
    '20002': 'камера не найдена в этом аккаунте — проверьте серийный номер',
    '20006': 'сеть облака недоступна',
    '20007': 'камера офлайн — включена ли она и есть ли у неё интернет',
    '20008': 'камера не отвечает на команду',
    '20014': 'серийный номер записан неверно',
    '20018': 'камера не принадлежит этому аккаунту',
    '49999': 'облако вернуло свою внутреннюю ошибку',
    '60020': 'у ключа приложения нет права на съёмку кадра',
  };
  return known[code] ?? `облако ответило кодом ${code}${msg ? `: ${msg}` : ''}`;
}

async function call<T>(host: string, path: string, body: URLSearchParams): Promise<T> {
  const res = await fetch(`${host}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const reply = (await res.json()) as EzvizReply<T>;
  // «200» здесь — код EZVIZ внутри тела, а не код HTTP.
  if (reply.code !== '200' || !reply.data) {
    throw new Error(explainCode(String(reply.code ?? '?'), reply.msg));
  }
  return reply.data;
}

/**
 * Ключ доступа.
 *
 * Живёт около недели, но НЕ КЭШИРУЕТСЯ здесь: снимок берётся раз в
 * минуту, лишний запрос на его фоне ничего не стоит, а кэш пришлось бы
 * согласовывать между процессами приложения. Дешевизна важнее.
 */
async function accessToken(cfg: EzvizConfig): Promise<string> {
  const data = await call<{ accessToken: string }>(
    cfg.host,
    '/api/lapp/token/get',
    new URLSearchParams({ appKey: cfg.appKey, appSecret: cfg.appSecret }),
  );
  return data.accessToken;
}

/**
 * Снять кадр и вернуть его байты.
 *
 * Две ступени: облако делает снимок и отдаёт ссылку, живущую два часа;
 * забираем сразу и не храним ссылку нигде. Отдать её браузеру было бы
 * проще, но это адрес чужого хранилища с временным доступом — витрина не
 * должна зависеть ни от его срока, ни от его доступности.
 */
export async function captureFrame(cfg: EzvizConfig): Promise<Buffer> {
  const token = await accessToken(cfg);
  const data = await call<{ picUrl: string }>(
    cfg.host,
    '/api/lapp/device/capture',
    new URLSearchParams({ accessToken: token, deviceSerial: cfg.deviceSerial }),
  );
  if (!data.picUrl) throw new Error('облако не вернуло ссылку на кадр');

  const pic = await fetch(data.picUrl, { signal: AbortSignal.timeout(20_000) });
  if (!pic.ok) throw new Error(`кадр не скачался: ${pic.status}`);
  return Buffer.from(await pic.arrayBuffer());
}
