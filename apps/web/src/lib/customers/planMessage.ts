// ══════════════════════════════════════════════════════════════════════
// Как объезд выглядит в Telegram.
//
// ОДИН ПОМОЩНИК НА ДВА МЕСТА. Этот список печатают уведомление о
// назначении и команда «Мой день» в боте. Два места, печатающих одно и то
// же разными руками, расходятся на первой правке — и человек получает в
// сообщении один порядок точек, а в боте другой.
//
// ПОЧЕМУ ЗДЕСЬ, А НЕ В БОТЕ. Порядок объезда, отметки визитов и остаток
// живут в базе витрины. Собирать текст в Python значило бы завести вторую
// выборку тех же данных и второе определение слова «выполнено».
//
// ЧИСТЫЙ МОДУЛЬ: ни Prisma, ни времени — только превращение уже прочитанных
// строк в текст. Поэтому проверяется тестами, а не глазами в чате.
// ══════════════════════════════════════════════════════════════════════

export interface PlanStopLine {
  name: string;
  /** Отмечен ли визит. Считается по отметкам, а не по нажатию в плане. */
  done: boolean;
  district?: string | null;
}

/** Telegram режет сообщение на 4096 символах — до этого лучше не доводить. */
export const MAX_LINES = 20;

/**
 * Список точек для чата.
 *
 * ВЫПОЛНЕННЫЕ НЕ ПРЯЧЕМ, а зачёркиваем. Спрятать значит соврать про объём
 * дня: человек видит четыре точки вместо восьми и не понимает, много ли
 * сделал. Зачёркнутое читается как «это позади».
 */
export function planLines(stops: PlanStopLine[]): string {
  if (stops.length === 0) return 'Точек нет.';

  const shown = stops.slice(0, MAX_LINES);
  const lines = shown.map((stop, index) => {
    const label = stop.district ? `${stop.name} · ${stop.district}` : stop.name;
    // <s> — зачёркивание в HTML-разметке Telegram. Галочка рядом нужна:
    // на части устройств зачёркивание почти не видно.
    return stop.done
      ? `${index + 1}. <s>${escapeHtml(label)}</s> ✅`
      : `${index + 1}. ${escapeHtml(label)}`;
  });

  const hidden = stops.length - shown.length;
  if (hidden > 0) lines.push(`… и ещё ${hidden}`);
  return lines.join('\n');
}

/** «Осталось 5 из 8» — короткий ответ на «сколько ещё». */
export function planProgress(stops: PlanStopLine[]): string {
  const done = stops.filter((s) => s.done).length;
  const left = stops.length - done;
  if (stops.length === 0) return 'Точек нет';
  if (left === 0) return `Все ${stops.length} объехали`;
  return `Осталось ${left} из ${stops.length}`;
}

/** Текст уведомления о назначенном объезде. */
export function assignedPlanText(params: {
  dateLabel: string;
  stops: PlanStopLine[];
  goods?: { name: string; qty: number; unit?: string | null }[];
}): string {
  const parts = [
    `🗺 <b>Объезд на ${escapeHtml(params.dateLabel)}</b> — ${params.stops.length} точек`,
    '',
    planLines(params.stops),
  ];

  if (params.goods && params.goods.length > 0) {
    parts.push(
      '',
      '<b>Взять с собой:</b>',
      params.goods
        .map((g) => `• ${escapeHtml(g.name)} — ${g.qty}${g.unit ? ` ${escapeHtml(g.unit)}` : ''}`)
        .join('\n'),
    );
  }

  return parts.join('\n');
}

/**
 * Экранирование под HTML-разметку Telegram.
 *
 * Названия заведений приходят из базы и содержат что угодно — «Плов & Co»
 * ломает разметку целиком, и сообщение не доставляется вовсе. Отказ при
 * этом тихий: Telegram отвечает 400, а человек просто не получает задание.
 */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
