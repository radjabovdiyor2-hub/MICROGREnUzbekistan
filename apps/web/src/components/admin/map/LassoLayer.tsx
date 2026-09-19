'use client';

import { useRef, useState } from 'react';

import { thinPath, type ScreenPoint } from '@/lib/customers/lasso';

// ══════════════════════════════════════════════════════════════════════
// Слой рисования поверх карты: обвёл район — собрал объезд.
//
// ЛЕЖИТ СВЕРХУ И ЗАБИРАЕТ СОБЫТИЯ СЕБЕ. Отдать их карте значило бы
// рисовать контур на уезжающей подложке: MapLibre двигает вид по тому же
// самому перетаскиванию.
//
// ЗАХВАТ УКАЗАТЕЛЯ ОБЯЗАТЕЛЕН. Палец уходит за край карты постоянно —
// человек обводит район целиком, а край экрана ближе. Без `setPointerCapture`
// события там теряются, и контур обрывается на полпути: выделяется не тот
// район, который обвели, а тот, который успел поместиться.
// ══════════════════════════════════════════════════════════════════════

export function LassoLayer({ onDone }: { onDone: (path: ScreenPoint[]) => void }) {
  const [path, setPath] = useState<ScreenPoint[]>([]);
  const drawing = useRef(false);
  const box = useRef<DOMRect | null>(null);

  const local = (e: React.PointerEvent): ScreenPoint => {
    const rect = box.current;
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 };
  };

  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    // Габарит берём один раз на касание: за время рисования он не меняется,
    // а `getBoundingClientRect` в обработчике движения — это пересчёт
    // разметки на каждый кадр.
    box.current = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    setPath([local(e)]);
  };

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing.current) return;
    setPath((p) => [...p, local(e)]);
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);

    // Разрежаем перед проверкой: от пальца приходит по сотне точек в
    // секунду, а сторон в контуре столько же, сколько проверок на каждую
    // точку карты.
    const finished = thinPath([...path, local(e)]);
    setPath([]);
    onDone(finished);
  };

  const d = path.length > 1 ? 'M ' + path.map((p) => `${p.x} ${p.y}`).join(' L ') + ' Z' : '';

  return (
    <div
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        cursor: 'crosshair',
        // Прокрутка страницы пальцем по карте в этом режиме означала бы,
        // что обвести район вертикально нельзя.
        touchAction: 'none',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      {d && (
        <svg width="100%" height="100%" style={{ display: 'block', pointerEvents: 'none' }}>
          <path
            d={d}
            fill="rgba(var(--brand-primary-rgb), 0.15)"
            stroke="var(--brand-primary)"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        </svg>
      )}
    </div>
  );
}
