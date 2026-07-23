'use client';

import { useEffect } from 'react';
import { trackEvent } from '@/lib/magazine/track';

/**
 * Считает просмотры серверных страниц «Живого меню».
 * Отдельный клиентский компонент, чтобы сами страницы остались серверными
 * и не тащили в браузер лишний JS ради одного события.
 */
export function MenuTracker({ slug, dishId }: { slug: string; dishId?: string }) {
  useEffect(() => {
    trackEvent({ type: dishId ? 'dish_view' : 'page_view', slug, dishId });
  }, [slug, dishId]);
  return null;
}
