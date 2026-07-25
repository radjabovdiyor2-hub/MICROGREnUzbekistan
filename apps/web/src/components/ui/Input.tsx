'use client';

import React, { useId } from 'react';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  /** Helper text under the field. Hidden when `error` is set. */
  hint?: string;
  /** Error message. Sets the error style + aria-invalid. */
  error?: string;
  inputSize?: InputSize;
}

const SIZE: Record<InputSize, string> = {
  sm: 'field__input--sm',
  md: '',
  lg: 'field__input--lg',
};

/**
 * Input — tier-2 form-field primitive (label + control + hint/error) over the
 * `.field` classes. Wires up ids and aria-describedby / aria-invalid for a11y.
 */
export function Input({
  label,
  hint,
  error,
  inputSize = 'md',
  required,
  id,
  className,
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  const fieldCls = ['field', error && 'field--error', className].filter(Boolean).join(' ');
  const inputCls = ['field__input', SIZE[inputSize]].filter(Boolean).join(' ');
  const labelCls = ['field__label', required && 'field__label--required'].filter(Boolean).join(' ');

  return (
    <div className={fieldCls}>
      {label && (
        <label htmlFor={inputId} className={labelCls}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={inputCls}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={msgId}
        {...rest}
      />
      {error ? (
        <span id={`${inputId}-error`} className="field__hint" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={`${inputId}-hint`} className="field__hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
