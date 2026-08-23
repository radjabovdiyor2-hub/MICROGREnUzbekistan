import { MAP_FONT } from './mapFont';
import type { TokenColors } from './useTokenColors';

// ══════════════════════════════════════════════════════════════════════
// Слои доставки — линия объезда и пронумерованные остановки.
//
// Выделены из mapLayers.ts, когда тот перерос читаемый размер. Граница
// проходит здесь не случайно: клиенты и доставка — разные источники,
// разное время жизни (клиенты меняются неделями, объезд — в течение дня)
// и разные роли (доставку видит только владелец, у неё свой роут).
// ══════════════════════════════════════════════════════════════════════

export const SOURCE_DELIVERY = 'delivery';
export const LAYER_DELIVERY_LEGS = 'delivery-legs';
export const LAYER_DELIVERY_STOPS = 'delivery-stops';
export const LAYER_DELIVERY_SEQ = 'delivery-seq';

/**
 * Слой доставки поверх клиентов: линия объезда и пронумерованные точки.
 *
 * Номер на точке — не украшение. Порядок объезда назначает диспетчер, и
 * без цифры линия читается как «маршрут откуда-то куда-то»: непонятно, с
 * какого конца курьер начинает. Доставленные точки гасятся до успеха,
 * чтобы на карте было видно, где он сейчас.
 */
export function buildDeliveryLayers(c: TokenColors) {
  const delivered = ['==', ['get', 'status'], 'delivered'];
  return [
    {
      id: LAYER_DELIVERY_LEGS,
      type: 'line' as const,
      source: SOURCE_DELIVERY,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: {
        'line-color': c.brand,
        'line-width': 3,
        'line-opacity': 0.6,
        'line-dasharray': [2, 1],
      },
    },
    {
      id: LAYER_DELIVERY_STOPS,
      type: 'circle' as const,
      source: SOURCE_DELIVERY,
      filter: ['==', ['get', 'kind'], 'stop'],
      paint: {
        'circle-color': ['case', delivered, c.success, c.brand],
        'circle-radius': 12,
        'circle-stroke-color': c.card,
        'circle-stroke-width': 2,
      },
    },
    {
      id: LAYER_DELIVERY_SEQ,
      type: 'symbol' as const,
      source: SOURCE_DELIVERY,
      filter: ['==', ['get', 'kind'], 'stop'],
      layout: {
        'text-field': ['to-string', ['get', 'seq']],
        // Стек назван явно: умолчательный уходит в 404 на нашем хосте
        // и откатывается на системный шрифт клиента — см. mapFont.ts.
        'text-font': MAP_FONT,
        'text-size': 12,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': c.card },
    },
  ];
}
