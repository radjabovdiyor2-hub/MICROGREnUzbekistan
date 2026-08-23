// ══════════════════════════════════════════════════════════════════════
// Мелочи обвязки карты, общие для шапки и дока.
//
// Чип и счётчик активных фильтров нужны в двух местах сразу: в шапке над
// картой и в доке полноэкранного режима. Скопировать их значило бы завести
// две ленты, которые однажды разойдутся по виду и по счёту.
// ══════════════════════════════════════════════════════════════════════

/** Чип-переключатель. Один стиль на все ленты карты. */
export const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px',
  borderRadius: 'var(--radius-full)',
  border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border)'}`,
  background: active ? 'var(--brand-primary)' : 'transparent',
  color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
  fontSize: 'var(--text-xs)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

/**
 * То, из чего складывается счётчик. Не весь хук: узкий тип позволяет
 * проверить счёт тестом, не собирая всё состояние карты целиком.
 */
export interface FilterState {
  typeFilter: string;
  cityFilter: string;
  companyTypes: Set<string>;
  audience: string;
  district: string | null;
  showProspects: boolean;
  showDelivery: boolean;
  showHeat: boolean;
}

/**
 * Сколько фильтров сейчас сужают карту.
 *
 * Свёрнутая лента обязана сказать, что под ней что-то включено: невидимый
 * работающий фильтр — это карта, которая необъяснимо пуста, и человек
 * ищет поломку там, где её нет.
 *
 * Слои («белые пятна», доставка, тепло) считаются наравне с фильтрами:
 * для человека это одинаково «я что-то включил», и разбираться, что из
 * этого сужает выборку, а что добавляет слой, он не обязан.
 */
export function activeFilterCount(m: FilterState): number {
  return (
    (m.typeFilter === 'all' ? 0 : 1) +
    (m.cityFilter === 'all' ? 0 : 1) +
    m.companyTypes.size +
    (m.audience === 'all' ? 0 : 1) +
    (m.district ? 1 : 0) +
    (m.showProspects ? 1 : 0) +
    (m.showDelivery ? 1 : 0) +
    (m.showHeat ? 1 : 0)
  );
}
