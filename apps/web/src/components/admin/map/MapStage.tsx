'use client';

import type { ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Сцена карты: холст и всё, что лежит поверх него.
//
// До этого поиск, легенда и панель точки стояли НАД картой и ПОД ней в
// потоке страницы, и на телефоне до самой карты приходилось доскроллить
// сквозь три сотни пикселей обвязки. Здесь они становятся оверлеями —
// карта получает всю высоту, а обвязка перестаёт её отнимать.
//
// Режим полного экрана — вёрстка (см. useMapFullscreen.ts), поэтому сцена
// про него знает ровно одно: какой класс на себя повесить.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  isFull: boolean;
  onToggleFull: () => void;
  /** Холст карты. */
  children: ReactNode;
  /** Поверх карты слева сверху: поиск и быстрые фильтры. */
  overlayTop?: ReactNode;
  /** Поверх карты слева снизу: легенда, панель точки. */
  overlayBottom?: ReactNode;
}

export function MapStage({
  lang,
  isFull,
  onToggleFull,
  children,
  overlayTop,
  overlayBottom,
}: Props) {
  const label = isFull
    ? { ru: 'Выйти из полного экрана', uz: 'Toʻliq ekrandan chiqish' }
    : { ru: 'На весь экран', uz: 'Toʻliq ekran' };

  return (
    <div className={`admin-map-stage${isFull ? ' is-full' : ''}`}>
      {children}

      {overlayTop && <div className="admin-map-overlay admin-map-overlay--top">{overlayTop}</div>}

      {/* Кнопка режима стоит слева, а не справа: справа MapLibre держит
          свои зум и «где я», и третья кнопка в той же колонке попадала бы
          под большой палец вместо них. */}
      <div
        className="admin-map-overlay"
        style={{
          top: 'calc(var(--space-2) + env(safe-area-inset-top, 0px))',
          right: 'var(--space-2)',
          left: 'auto',
        }}
      >
        <button
          type="button"
          className="btn btn-icon"
          onClick={onToggleFull}
          aria-pressed={isFull}
          aria-label={label[lang]}
          title={label[lang]}
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-md)',
            // Ниже штатных контролов MapLibre, которые сидят в top-right:
            // иначе кнопка накрывает зум ровно там, куда целятся чаще.
            marginTop: 76,
          }}
        >
          {isFull ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      {overlayBottom && (
        <div className="admin-map-overlay admin-map-overlay--bottom">{overlayBottom}</div>
      )}
    </div>
  );
}
