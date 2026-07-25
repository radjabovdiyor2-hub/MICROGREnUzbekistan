'use client';

import React from 'react';

export type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Maps to the design-system `.btn-*` classes. */
  variant?: ButtonVariant;
  /** Size. `icon` is a square 44px tap target. */
  size?: ButtonSize;
  /** Full-width. */
  block?: boolean;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  accent: 'btn-accent',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
  icon: 'btn-icon',
};

/**
 * Button — tier-2 primitive. A thin, typed wrapper over the design-system
 * `.btn` classes so every button in the app shares one source of truth for
 * variants, sizes and states. See Button.stories.tsx for the state catalog.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  leftIcon,
  rightIcon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = ['btn', VARIANT[variant], SIZE[size], block && 'btn-block', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
