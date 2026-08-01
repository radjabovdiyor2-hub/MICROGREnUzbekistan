// Стили кнопок модерации гостевых фото. Вынесены из AdminGuestPhotos.

import type React from 'react';

export const btn: React.CSSProperties = {
  padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border-color)',
  background: 'transparent', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 600,
};

export const btnPrimary: React.CSSProperties = {
  ...btn, border: '1px solid var(--brand-primary)', background: 'var(--brand-primary)', color: 'var(--text-inverse)',
};
