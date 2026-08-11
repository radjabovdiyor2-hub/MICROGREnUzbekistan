import type { CSSProperties } from 'react';

// Общие стили полей админских форм.
//
// Эти два объекта были скопированы в AdminCropNormForm и
// AdminRawMaterialForm по отдельности и уже успели разойтись: в одном
// рамка бралась из `--border-primary`, в другом из `--border`. Держим одну
// пару — иначе поля соседних форм выглядят по-разному без всякой причины.

export const input: CSSProperties = {
  width: '100%',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 'var(--text-sm)',
};

export const label: CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  marginBottom: 4,
  display: 'block',
};
