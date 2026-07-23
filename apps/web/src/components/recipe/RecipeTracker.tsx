'use client';

import { useEffect } from 'react';
import { trackEvent } from '@/lib/magazine/track';

/** Считает просмотр рецепта. Отдельный клиентский компонент, чтобы страница
 *  рецепта осталась серверной. */
export function RecipeTracker({ slug }: { slug: string }) {
  useEffect(() => {
    trackEvent({ type: 'recipe_view', slug });
  }, [slug]);
  return null;
}
