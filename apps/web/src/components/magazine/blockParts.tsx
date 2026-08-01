// Мелкие части полос журнала: трёхъязычный текст, номер страницы,
// колонтитул, иллюстрация. Вынесено из blocks.tsx.

import React from 'react';
import type { L10n } from '@/lib/magazine/types';
import { tri, inline, type Lang, type UIKey } from '@/lib/magazine/i18n';

/** Подпись интерфейса на двух языках в одну строку. */
export function ui(key: UIKey) { return inline(key); }

const PRIMARY: Lang = 'uz';

export function Tri({ v, style, secondaryScale = 0.78, className }: {
  v: L10n | undefined | null;
  style?: React.CSSProperties;
  secondaryScale?: number;
  className?: string;
}) {
  const parts = tri(v);
  if (!parts.length) return null;
  const [main, ...rest] = parts;
  const baseSize = typeof style?.fontSize === 'string' ? parseFloat(style.fontSize) : undefined;
  const secSize = baseSize ? `${(baseSize * secondaryScale).toFixed(1)}pt` : '7.5pt';
  return (
    <div className={className}>
      <div style={style}>{main.text}</div>
      {rest.length > 0 && (
        <div className="mag-lang-sec">
          {rest.map((p) => (
            <div key={p.lang} className="mag-lang-sec-line" style={{ fontSize: secSize }}>
              <span className="mag-lang-tag">{p.lang}</span>{p.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Общие мелкие детали ──
export function PageNum({ n }: { n: number }) {
  const side = n % 2 === 0 ? 'mag-page-num-r' : 'mag-page-num-l';
  return <div className={`mag-page-num ${side}`}>{n}</div>;
}

export function RunningHeader({ right, cobrand }: { right: string; cobrand?: string }) {
  return (
    <div className="mag-running-header">
      <div className="mag-masthead">
        Fresh Weekly
        {cobrand && <span style={{ color: 'var(--gold)', fontWeight: 800 }}> &amp; {cobrand}</span>}
      </div>
      <div>{right}</div>
    </div>
  );
}

/** Фото с подписью (подпись — обязательный элемент редакционной вёрстки). */
export function Figure({ src, caption, height }: { src?: string; caption?: L10n; height?: string }) {
  if (!src) return null;
  return (
    <figure className="mag-figure">
      <img src={src} alt="" style={height ? { height } : undefined} />
      {caption && (
        <figcaption className="mag-photo-caption">
          {tri(caption).map((p) => p.text).join(' · ')}
        </figcaption>
      )}
    </figure>
  );
}
