// Формы данных экрана «Назначить объезд». Вынесены отдельно, потому что
// сам компонент упирался в лимит 200 строк, а типы читают и он, и выбор
// точек рядом.

export interface AssignEmployee {
  id: string;
  name: string;
  role: string;
  /** Строкой или null: BigInt в JSON не сериализуется. */
  telegramId: string | null;
}

export interface ScheduledRow {
  id: number;
  weekday: number;
  customer: { id: number; name: string | null; address: string | null; district: string | null };
}
