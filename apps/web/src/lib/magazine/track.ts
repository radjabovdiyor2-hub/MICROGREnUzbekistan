// ════════════════════════════════════════════════════════════
// Клиентский трекер для аналитики журнала.
// Анонимный sessionId генерируется один раз и хранится в sessionStorage.
// Fire-and-forget: ошибки трекинга не ломают UX.
// ════════════════════════════════════════════════════════════

type EventType =
  | 'page_view' | 'ar_scan' | 'ar_collect' | 'qr_scan'
  | 'kids_riddle' | 'kids_tale' | 'kids_passport';

interface TrackPayload {
  type: EventType;
  slug?: string;
  charId?: string;
  meta?: Record<string, unknown>;
}

function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  const KEY = 'fw_session_id';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

export function trackEvent(payload: TrackPayload): void {
  if (typeof window === 'undefined') return;
  // Fire-and-forget
  fetch('/api/magazine/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      sessionId: getSessionId(),
    }),
  }).catch(() => { /* silent */ });
}
