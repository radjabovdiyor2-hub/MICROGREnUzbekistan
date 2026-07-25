'use client';

import React from 'react';

export type BadgeVariant =
  | 'primary'
  | 'accent'
  | 'ghost'
  | 'outline'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT: Record<BadgeVariant, string> = {
  primary: 'badge-primary',
  accent: 'badge-accent',
  ghost: 'badge-ghost',
  outline: 'badge-outline',
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  info: 'badge-info',
};

/**
 * Badge — tier-2 label/indicator primitive over the `.badge` classes.
 * Brand variants live in globals.css; semantic variants in components.css.
 */
export function Badge({ variant = 'primary', className, children, ...rest }: BadgeProps) {
  const cls = ['badge', VARIANT[variant], className].filter(Boolean).join(' ');
  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  );
}
