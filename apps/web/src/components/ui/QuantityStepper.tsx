'use client';

import { Minus, Plus } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Счётчик количества: −  N  +
//
// Один и тот же элемент был написан ТРИЖДЫ — в строке корзины, на странице
// товара и на карточке каталога, — и все три раза по-разному: 36×36, 44×44
// и 36×32. Два из трёх не дотягивали до 44 пикселей, ниже которых палец
// начинает промахиваться; у двух из трёх не было подписи, и экранный
// диктор читал их просто как «кнопка».
//
// Размер по умолчанию — 44. Меньше можно попросить явно (`size`), но тогда
// это осознанное решение в одном месте, а не случайность в трёх.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  value: number;
  onChange: (next: number) => void;
  /** Ниже этого не опускаем. 1 — обычная корзина, 0 — «убрать совсем». */
  min?: number;
  /** Сторона квадратной кнопки. 44 — минимум для пальца. */
  size?: number;
  /** Ширина числа между кнопками. */
  valueWidth?: number;
  /** Круглая рамка — вид строки корзины. */
  bordered?: boolean;
  labels?: { less: string; more: string };
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  size = 44,
  valueWidth = 32,
  bordered = false,
  labels = { less: 'Меньше', more: 'Больше' },
}: Props) {
  const button: React.CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    ...(bordered
      ? { borderRadius: 'var(--radius-full)', border: '1px solid var(--border)' }
      : {}),
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label={labels.less}
        disabled={value <= min}
        onClick={(e) => {
          // Счётчик живёт и внутри ссылки на товар (карточка каталога):
          // без этого нажатие «минус» уводило бы на страницу товара.
          e.preventDefault();
          e.stopPropagation();
          onChange(value - 1);
        }}
        style={button}
      >
        <Minus size={16} />
      </button>

      <span
        aria-live="polite"
        style={{ fontWeight: 'var(--font-bold)', width: valueWidth, textAlign: 'center' }}
      >
        {value}
      </span>

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label={labels.more}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onChange(value + 1);
        }}
        style={button}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
