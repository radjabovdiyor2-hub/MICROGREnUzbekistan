// ════════════════════════════════════════════════════════════
// Клиентский трекер для аналитики журнала.
// Анонимный sessionId генерируется один раз и хранится в sessionStorage.
// Fire-and-forget: ошибки трекинга не ломают UX.
// ════════════════════════════════════════════════════════════

type EventType =
  | 'page_view' | 'qr_scan'
  | 'dish_view' | 'frame_open' | 'photo_submitted' | 'photo_shared'
  | 'stamp_earned' | 'reward_issued'
  | 'recipe_view' | 'recipe_cart';

interface TrackPayload {
  type: EventType;
  slug?: string;
  dishId?: string;
  meta?: Record<string, unknown>;
}

export function getSessionId(): string {
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
