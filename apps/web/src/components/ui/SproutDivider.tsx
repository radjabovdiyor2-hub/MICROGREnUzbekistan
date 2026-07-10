'use client';

// Lightweight decorative section divider — a small cluster of microgreen
// sprouts that "grow" up from a hairline. Pure SVG + CSS (no canvas), so it is
// cheap to render many times. Respects prefers-reduced-motion via globals.css.
export function SproutDivider({ flip = false }: { flip?: boolean }) {
  // stems: [x, height, leafColor, delayMs]
  const stems: [number, number, string, number][] = [
    [60, 26, 'var(--brand-primary)', 0],
    [110, 40, 'var(--brand-primary-hover, var(--brand-primary))', 120],
    [160, 20, 'var(--brand-accent)', 240],
    [210, 34, 'var(--brand-primary)', 180],
    [260, 24, 'var(--success)', 300],
  ];

  return (
    <div className="sprout-divider" aria-hidden="true" style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
      <span className="sprout-divider__line" />
      <svg width="320" height="52" viewBox="0 0 320 52" fill="none" className="sprout-divider__svg">
        {stems.map(([x, h, color, delay], i) => {
          const topY = 48 - h;
          return (
            <g key={i} className="sprout-divider__stem" style={{ animationDelay: `${delay}ms`, transformOrigin: `${x}px 48px` }}>
              {/* stem */}
              <line x1={x} y1={48} x2={x} y2={topY} stroke="var(--brand-primary)" strokeWidth={2} strokeLinecap="round" opacity={0.55} />
              {/* two leaves */}
              <path d={`M${x} ${topY + 6} Q${x - 12} ${topY} ${x - 2} ${topY - 6} Q${x - 4} ${topY + 2} ${x} ${topY + 6}`} fill={color} opacity={0.85} />
              <path d={`M${x} ${topY + 6} Q${x + 12} ${topY} ${x + 2} ${topY - 6} Q${x + 4} ${topY + 2} ${x} ${topY + 6}`} fill={color} opacity={0.7} />
            </g>
          );
        })}
      </svg>
      <span className="sprout-divider__line" />
    </div>
  );
}
