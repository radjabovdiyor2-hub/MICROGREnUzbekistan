'use client';

import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: ToastVariant;
  /** Show a close button and call this when clicked. */
  onClose?: () => void;
  /** Render in normal flow (position: static) instead of fixed — for embedding
   *  inside a custom container or in Storybook. */
  inline?: boolean;
}

const ICON = { success: CheckCircle, error: XCircle, warning: AlertTriangle, info: Info } as const;
const ICON_COLOR: Record<ToastVariant, string> = {
  success: 'var(--success)',
  error: 'var(--error)',
  warning: 'var(--warning)',
  info: 'var(--info)',
};

/**
 * Toast — tier-2 notification primitive over `.toast` / `.toast--*`. The app can
 * mount it via a portal/provider; `inline` makes it position: static for stories.
 */
export function Toast({
  variant = 'info',
  onClose,
  inline = false,
  className,
  children,
  style,
  ...rest
}: ToastProps) {
  const Icon = ICON[variant];
  const cls = ['toast', `toast--${variant}`, className].filter(Boolean).join(' ');
  return (
    <div role="status" className={cls} style={inline ? { position: 'static', ...style } : style} {...rest}>
      <Icon size={18} style={{ color: ICON_COLOR[variant], flexShrink: 0 }} aria-hidden="true" />
      <span style={{ flex: 1 }}>{children}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          style={{ display: 'flex', padding: 4, color: 'var(--text-muted)' }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
