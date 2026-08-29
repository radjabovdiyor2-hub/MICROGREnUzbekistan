import type { FeedItem } from './items';

// ══════════════════════════════════════════════════════════════════════
// Каталог Meta в CSV.
//
// Facebook Shops и товарные метки Instagram в Узбекистане недоступны:
// Meta с 10.08.2023 ограничила список стран. Каталог всё равно нужен —
// по нему работают реклама и карточки товара в директе, а директом у нас
// торгует офис (`apps/tgas/shared/instagram_dm.py`).
// ══════════════════════════════════════════════════════════════════════

const COLUMNS = [
  'id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'link',
  'image_link',
  'brand',
  'quantity_to_sell_on_facebook',
] as const;

/**
 * Экранирование поля CSV.
 *
 * Описание товара содержит запятые и переводы строк — без кавычек они
 * сдвигают колонки, и каталог загрузится с ценой в поле бренда.
 */
function cell(value: string | number): string {
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function renderMetaCsv(items: FeedItem[]): string {
  const rows = items.map((item) =>
    [
      cell(item.id),
      cell(item.title),
      cell(item.description),
      cell(item.available ? 'in stock' : 'out of stock'),
      cell('new'),
      cell(`${item.price} UZS`),
      cell(item.link),
      cell(item.imageLink),
      cell(item.brand),
      cell(item.quantity),
    ].join(','),
  );
  return [COLUMNS.join(','), ...rows].join('\n');
}
