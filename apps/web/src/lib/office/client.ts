// ══════════════════════════════════════════════════════════════════════
// Клиент ИИ-офиса (apps/tgas/web_office, FastAPI на 8050).
//
// Собран в одном месте, потому что каждый маршрут админки, который ходит
// в офис, обязан делать три вещи одинаково: слать общий секрет, держать
// таймаут и НЕ выдавать недоступность офиса за успех. Именно последнее
// сломало «Пульт ИИ»: роут отвечал {status:'ok'}, когда запрос падал.
// ══════════════════════════════════════════════════════════════════════

const OFFICE_URL =
  process.env.TGAS_OFFICE_URL || process.env.WEB_OFFICE_URL || 'http://localhost:8050';

export interface OfficeResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export async function officeFetch<T = unknown>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<OfficeResult<T>> {
  const { timeoutMs = 15_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${OFFICE_URL}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.INGEST_SECRET ? { 'X-Ingest-Secret': process.env.INGEST_SECRET } : {}),
        ...(rest.headers ?? {}),
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    const data = (await res.json().catch(() => null)) as T | null;

    if (!res.ok) {
      const err = (data as { error?: string } | null)?.error;
      return { ok: false, status: res.status, data, error: err || `ИИ-офис ответил ${res.status}` };
    }
    return { ok: true, status: res.status, data };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.error(`[office] ${path} не удался:`, error);
    return {
      ok: false,
      status: 504,
      data: null,
      error: aborted
        ? 'ИИ-офис не ответил вовремя'
        : 'ИИ-офис недоступен. Проверьте контейнер mg_web_office',
    };
  } finally {
    clearTimeout(timer);
  }
}
