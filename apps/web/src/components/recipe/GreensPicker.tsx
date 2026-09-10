'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ShoppingCart } from 'lucide-react';

import { useCart } from '@/components/providers/CartProvider';
import { useLang } from '@/components/providers/LangProvider';
import { trackEvent } from '@/lib/magazine/track';
import type { DishWithGreens } from '@/lib/recipes';

// ══════════════════════════════════════════════════════════════════════
// «Какую зелень добавить?» — вход от блюда, а не от рецепта.
//
// ЧЕМ ОТЛИЧАЕТСЯ ОТ СПИСКА РЕЦЕПТОВ НИЖЕ. Сетка рецептов отвечает на
// вопрос «что бы приготовить»: человек читает, выбирает, открывает
// страницу, там ингредиенты, шаги, таймеры. Это правильный путь, когда
// решения ещё нет.
//
// Здесь путь обратный и короче: человек УЖЕ ЗНАЕТ, что готовит, и ему
// нужен один ответ — какая зелень сюда подходит и как её купить. Выбрал
// блюдо — увидел зелень — положил в корзину, не уходя со страницы. Ради
// одного этого ответа открывать рецепт и листать до ингредиентов — три
// лишних шага.
//
// БЕЗ СОБСТВЕННЫХ ДАННЫХ. Блюда и зелень приходят пропсом из
// `listDishesWithGreens()` — той же выборки, что кормит страницу для
// закупщиков. Свой запрос разошёлся бы с ней на первой правке.
// ══════════════════════════════════════════════════════════════════════

export function GreensPicker({ dishes }: { dishes: DishWithGreens[] }) {
  const { t } = useLang();
  const { addItem } = useCart();
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  if (dishes.length === 0) return null;

  const picked = dishes.find((d) => d.slug === pickedSlug) ?? null;

  const choose = (slug: string) => {
    setPickedSlug((cur) => (cur === slug ? null : slug));
    // Сбрасываем отметку: «в корзине» от прошлого блюда сбило бы с толку.
    setAdded(false);
  };

  const collect = () => {
    if (!picked) return;
    picked.greens.forEach((g) => addItem(g, 1));
    trackEvent({ type: 'recipe_cart', slug: picked.slug });
    setAdded(true);
  };

  return (
    <div className="card" style={{ padding: 'var(--space-5)' }}>
      <h2 style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xl)' }}>
        {t("Qaysi ko'katni qo'shish kerak?", 'Какую зелень добавить?')}
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
        {t('Taomni tanlang — mos keladigan ko‘katni ko‘rsatamiz', 'Выберите блюдо — покажем, что к нему подходит')}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
        {dishes.map((d) => {
          const active = d.slug === pickedSlug;
          return (
            <button
              key={d.slug}
              onClick={() => choose(d.slug)}
              className={active ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              style={{ minHeight: 44 }}
            >
              {t(d.titleUz || d.titleRu, d.titleRu)}
            </button>
          );
        })}
      </div>

      {picked && (
        <div style={{ marginTop: 'var(--space-5)' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {t('Bu taomga mos keladi:', 'К этому блюду подходит:')}
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-3) 0 0' }}>
            {picked.greens.map((g) => (
              <li
                key={g.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-2) 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <Link
                  href={`/product/${g.id}`}
                  style={{ color: 'inherit', textDecoration: 'none', fontWeight: 'var(--font-medium)' }}
                >
                  {t(g.nameUz, g.nameRu)}
                </Link>
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>
                  {g.price.toLocaleString('ru-RU')} · {g.unit}
                </span>
              </li>
            ))}
          </ul>

          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
            <button
              onClick={collect}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44 }}
            >
              {added ? <Check size={16} /> : <ShoppingCart size={16} />}
              {added
                ? t('Savatda', 'В корзине')
                : t(`Savatga (${picked.greens.length})`, `В корзину (${picked.greens.length})`)}
            </button>

            {/* Полный рецепт остаётся на своём месте: подборщик отвечает
                на один вопрос, а шаги и таймеры живут на странице блюда. */}
            <Link href={`/recipe/${picked.slug}`} className="btn btn-ghost" style={{ minHeight: 44 }}>
              {t('Retseptni ochish', 'Открыть рецепт')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
