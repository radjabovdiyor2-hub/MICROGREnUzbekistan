'use client';

import React from 'react';

export interface ProgressProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'role'> {
  /** Current value. */
  value: number;
  /** Maximum value (default 100). */
  max?: number;
  /** Accessible label describing what is progressing. */
  label?: string;
}

/**
 * Progress — tier-2 linear progress primitive over `.progress` / `.progress-bar`.
 */
export function Progress({ value, max = 100, label, className, ...rest }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={['progress', className].filter(Boolean).join(' ')}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      {...rest}
    >
      <div className="progress-bar" style={{ width: `${pct}%` }} />
    </div>
  );
}
