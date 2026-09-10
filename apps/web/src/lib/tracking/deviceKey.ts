import { isNativeApp } from '@/lib/native/bridge';

// ══════════════════════════════════════════════════════════════════════
// Ключ устройства на стороне приложения: получить, сохранить, приложить.
//
// ЗАЧЕМ ОН НУЖЕН ИМЕННО ЗДЕСЬ. Родная служба будит приложение и отдаёт
// точку в любой момент суток — через час после того, как человек убрал
// телефон в карман, и через неделю после того, как он последний раз
// открывал экран. Сессия к этому моменту давно истекла, и пачка ушла бы
// в 401. Ключ не истекает и отзывается владельцем поштучно.
//
// ТОЛЬКО В ПРИЛОЖЕНИИ. В браузере ключ не нужен и не запрашивается:
// вкладка живёт ровно столько, сколько на неё смотрят, и сессии хватает.
// Хранить долгоживущий ключ в обычном браузере значило бы завести второй
// способ входа там, где его никто не просил.
// ══════════════════════════════════════════════════════════════════════

export const DEVICE_KEY_STORAGE = 'mg-device-key';

/** Ключ из хранилища. Мусор — это отсутствие ключа, а не падение. */
export function readDeviceKey(storage: Pick<Storage, 'getItem'>): string | null {
  try {
    const raw = storage.getItem(DEVICE_KEY_STORAGE);
    if (!raw || !raw.startsWith('mgd_')) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeDeviceKey(storage: Pick<Storage, 'setItem'>, token: string): void {
  try {
    storage.setItem(DEVICE_KEY_STORAGE, token);
  } catch {
    // Хранилище переполнено или закрыто настройками. Ключ не сохранён —
    // приложение попросит новый при следующем запуске, а трек до тех пор
    // уйдёт по сессии.
  }
}

export function forgetDeviceKey(storage: Pick<Storage, 'removeItem'>): void {
  try {
    storage.removeItem(DEVICE_KEY_STORAGE);
  } catch {
    // Нечего забывать — не повод падать.
  }
}

/**
 * Как человек увидит этот телефон в списке владельца.
 *
 * Разбираем строку браузера грубо и намеренно: «Redmi Note 12» полезнее,
 * чем сорок символов версий, а точная модель здесь ни на что не влияет.
 */
export function deviceLabel(userAgent: string): string {
  const model = /Android[^;)]*;\s*([^;)]+)\)/.exec(userAgent)?.[1]?.trim();
  if (model && model.length > 1 && !/^wv$/i.test(model)) return model.slice(0, 60);
  return 'Телефон';
}

/**
 * Ключ этого устройства: взять сохранённый или попросить новый.
 *
 * `null` означает «работаем по сессии» — и это нормальный случай: браузер,
 * или приложение сразу после установки, пока человек ещё не вошёл.
 * Молчаливого отказа здесь быть не должно, но и ронять запись дня из-за
 * неудачного запроса нельзя: трек уйдёт по сессии, пока она жива.
 */
export async function ensureDeviceKey(): Promise<string | null> {
  if (typeof window === 'undefined' || !isNativeApp()) return null;

  const saved = readDeviceKey(localStorage);
  if (saved) return saved;

  try {
    const res = await fetch('/api/auth/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: deviceLabel(navigator.userAgent) }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string };
    if (typeof body.token !== 'string' || !body.token.startsWith('mgd_')) return null;

    writeDeviceKey(localStorage, body.token);
    return body.token;
  } catch {
    return null;
  }
}
