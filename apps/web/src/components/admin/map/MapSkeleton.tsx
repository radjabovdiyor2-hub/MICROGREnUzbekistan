'use client';

import { RefreshCw } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Заглушка на месте холста.
//
// Показывается дважды и по разным поводам: пока грузится сам maplibre-gl
// (он идёт отдельным чанком через next/dynamic) и когда подложка не
// приехала вовсе. Во втором случае родитель рядом объясняет словами, что
// случилось, — серый прямоугольник без объяснения читается как поломка.
// ══════════════════════════════════════════════════════════════════════

export function MapSkeleton() {
  return (
    <div
      style={{
        height: '100%',
        minHeight: 320,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-tertiary)',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--text-muted)',
      }}
    >
      <RefreshCw size={20} className="animate-spin" />
    </div>
  );
}
