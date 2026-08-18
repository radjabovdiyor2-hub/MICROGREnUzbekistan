// ══════════════════════════════════════════════════════════════════════
// Границы суток по МЕСТНОМУ времени — одно определение на всю витрину.
//
// Модуль намеренно пустой на зависимости: ни Prisma, ни node:crypto, ничего
// серверного. Эти функции жили в `lib/revenue/salesLedger`, а он первой
// строкой поднимает Prisma-клиент — и когда календарь кассы
// (`AdminPOSSaleOptions`, клиентский компонент) позвал отсюда
// `formatLocalDate`, в браузерный бандл поехал весь клиент базы. Turbopack
// честно сообщал об этом ошибкой «eval() is not supported» и трассой до
// `createPrismaClient`.
//
// `salesLedger` эти же имена реэкспортирует: определение по-прежнему одно,
// а импортировать его теперь можно и с клиента.
// ══════════════════════════════════════════════════════════════════════

/** Начало суток по местному времени — одна граница на все отчёты.
 *
 *  Касса считала день по UTC, аналитика — по локали; для Asia/Samarkand это
 *  пять часов расхождения, и продажи с полуночи до пяти утра попадали в разные
 *  сутки на соседних плитках одного экрана.
 */
export function startOfLocalDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** «YYYY-MM-DD» по местному времени.
 *
 *  `toISOString().slice(0, 10)` отдаёт дату по UTC: с полуночи до пяти утра по
 *  Ташкенту это вчерашнее число. Так номер заказа, оформленного 12 августа в
 *  02:00, получался `M-20260811-…`, и персонал не находил его по дате.
 */
export function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Границы суток по местному времени для «YYYY-MM-DD» (или для сегодня).
 *
 *  Отчёт смены строил их сам: `new Date(`${date}T00:00:00.000Z`)` — это явный
 *  UTC, то есть 05:00 по Ташкенту. Продажа в 03:00 в отчёт за свой день не
 *  попадала, зато попадала в чужой, и «Касса сегодня» на сводке владельца
 *  показывала не то же самое, что отчёт продавца по той же смене.
 *
 *  Верхняя граница — начало следующих суток, сравнение строгое (`lt`):
 *  `23:59:59.999` теряет последнюю миллисекунду часа.
 */
export function localDayRange(date?: string): { start: Date; end: Date } {
  // Строка без суффикса «Z» разбирается как местное время — это и нужно.
  const start = date ? startOfLocalDay(new Date(`${date}T00:00:00`)) : startOfLocalDay();
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function daysAgo(days: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return startOfLocalDay(d);
}
