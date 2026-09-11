// Формы ответа `/api/admin/tracking/day`. Вынесены отдельно, потому что их
// читают три компонента: контейнер, лента и строка плеча.

export interface FieldDayHead {
  id: number;
  startedAt: string;
  endedAt: string | null;
  source: string;
  meters: number;
  movingSec: number;
  stops: number;
  employee: { id: string; name: string };
}

export interface FieldStay {
  id: number;
  arrivedAt: string;
  leftAt: string | null;
  dwellSec: number | null;
  /** `manual` — отмечено человеком, `derived` — выведено из трека. */
  confirmedBy: string;
  customer: {
    id: number;
    name: string | null;
    companyName: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  interaction: { id: number; interactionType: string; distanceM: number | null } | null;
  photos: { id: number; imageUrl: string; width: number; height: number }[];
}

export interface FieldLeg {
  id: number;
  fromStayId: number;
  toStayId: number;
  departedAt: string;
  arrivedAt: string;
  actualSec: number;
  actualMeters: number;
  expectedSec: number | null;
  expectedMeters: number | null;
  provider: string | null;
  trafficUsed: boolean;
}

/**
 * Простой: человек на связи, но стоит на месте и не у клиента.
 *
 * В базе его нет — считается из трека при чтении дня (`lib/tracking/idle`).
 * Поэтому здесь нет `id`: у окна простоя нет собственной жизни, к нему
 * нельзя привязать фото и его нельзя подтвердить.
 */
export interface FieldIdle {
  startedAt: string;
  endedAt: string;
  idleSec: number;
  latitude: number;
  longitude: number;
  pings: number;
}

/**
 * Смена — то, что человек открыл кнопкой. НЕ путать с окном трека.
 *
 * `null` означает «смену сегодня не открывал», и это ответ, а не отсутствие
 * данных: по нему видно, что трек шёл в нерабочее время.
 */
export interface FieldShift {
  startTime: string;
  endTime: string | null;
  /** `pwa` | `bot` | `web` — откуда нажали. */
  openedVia: string | null;
  /** Закрыл вечерний проход по последней точке, а не человек. */
  closedAuto: boolean;
}

export interface FieldDayResponse {
  day: FieldDayHead | null;
  shift: FieldShift | null;
  track: { at: string; latitude: number; longitude: number; accuracyM: number | null }[];
  stays: FieldStay[];
  legs: FieldLeg[];
  /** Окна простоя. Пустой массив — не «не считали», а «не стоял». */
  idle: FieldIdle[];
  /** Сколько раз за день связь пропадала дольше `GAP_MS`. */
  gaps: number;
  /** Порог простоя из настроек — им же помечается долгая стоянка. */
  idleAfterMin?: number;
}

export interface EmployeeOption {
  id: string;
  name: string;
}

/** «1 ч 25 мин» — длительности читают глазами, а не считают в уме из секунд. */
export function humanDuration(sec: number | null, lang: 'ru' | 'uz'): string {
  if (sec === null || sec < 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  const hh = lang === 'ru' ? 'ч' : 'soat';
  const mm = lang === 'ru' ? 'мин' : 'daq';
  if (h === 0) return `${m} ${mm}`;
  return `${h} ${hh} ${m} ${mm}`;
}

/** «3.2 км» или «840 м». Километры до десятых: точнее не читается. */
export function humanDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} м`;
  return `${(meters / 1000).toFixed(1)} км`;
}

/** «14:05» по местному времени. */
export function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function stayTitle(stay: FieldStay): string {
  return stay.customer.companyName || stay.customer.name || `#${stay.customer.id}`;
}
