'use client';

import React from 'react';

export type SkeletonShape = 'text' | 'rect' | 'circle';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shape?: SkeletonShape;
  width?: number | string;
  height?: number | string;
  /** For shape="text": number of lines (last line is shortened). */
  lines?: number;
}

/**
 * Skeleton — tier-2 loading-placeholder primitive over `.skeleton` (+ shimmer).
 * Respects prefers-reduced-motion via the CSS (shimmer disabled there).
 */
export function Skeleton({
  shape = 'rect',
  width,
  height,
  lines = 1,
  className,
  style,
  ...rest
}: SkeletonProps) {
  if (shape === 'text' && lines > 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }} aria-hidden="true" {...rest}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={['skeleton', 'skeleton-text', className].filter(Boolean).join(' ')}
            style={{ width: i === lines - 1 ? '70%' : (width ?? '100%'), height, ...style }}
          />
        ))}
      </div>
    );
  }

  const shapeCls = shape === 'text' ? 'skeleton-text' : shape === 'circle' ? 'skeleton-circle' : '';
  return (
    <div
      className={['skeleton', shapeCls, className].filter(Boolean).join(' ')}
      style={{ width, height, ...style }}
      aria-hidden="true"
      {...rest}
    />
  );
}
