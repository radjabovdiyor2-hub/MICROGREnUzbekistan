'use client';

import type { ReactNode } from 'react';

// ══════════════════════════════════════════════════════════════════════
// Сцена карты: холст и всё, что лежит поверх него.
//
// До этого поиск, легенда и панель точки стояли НАД картой и ПОД ней в
// потоке страницы, и на телефоне до самой карты приходилось доскроллить
// сквозь три сотни пикселей обвязки.
//
// Режим полного экрана — вёрстка (см. useMapFullscreen.ts), поэтому сцена
// про него знает ровно одно: какой класс на себя повесить. Кнопка режима
// сюда не входит — она родной контрол MapLibre и живёт в холсте, в общей
// стопке справа сверху (mapFullscreenControl.ts).
// ══════════════════════════════════════════════════════════════════════

interface Props {
  isFull: boolean;
  /** Холст карты. */
  children: ReactNode;
  /** Поверх карты слева сверху: поиск и быстрые фильтры. */
  overlayTop?: ReactNode;
  /** Поверх карты слева снизу: выбор из нескольких точек под пальцем. */
  overlayBottom?: ReactNode;
}

export function MapStage({ isFull, children, overlayTop, overlayBottom }: Props) {
  return (
    <div className={`admin-map-stage${isFull ? ' is-full' : ''}`}>
      {children}

      {overlayTop && <div className="admin-map-overlay admin-map-overlay--top">{overlayTop}</div>}

      {overlayBottom && (
        <div className="admin-map-overlay admin-map-overlay--bottom">{overlayBottom}</div>
      )}
    </div>
  );
}
