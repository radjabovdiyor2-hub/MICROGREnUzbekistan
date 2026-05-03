'use client';

import Link from 'next/link';
import * as Icons from '@/components/ui/Icons';
import { useLang } from '@/components/providers/LangProvider';

export function CategoriesSection() {
  const { t } = useLang();

  const CATEGORIES = [
    { slug: 'mikrozelen', icon: <Icons.Leaf size={22} />, name: t("Mikroko'katlar", 'Микрозелень'), color: '#10B981' },
    { slug: 'salaty', icon: <Icons.Leaf size={22} />, name: t('Salatlar', 'Салаты'), color: '#22C55E' },
    { slug: 'tsvety', icon: <Icons.Sparkles size={22} />, name: t('Gullar', 'Цветы'), color: '#EC4899' },
    { slug: 'semena', icon: <Icons.Droplet size={22} />, name: t("Urug'lar", 'Семена'), color: '#F59E0B' },
    { slug: 'substrat', icon: <Icons.Package size={22} />, name: t('Substrat', 'Субстрат'), color: '#8B5CF6' },
    { slug: 'udobreniya', icon: <Icons.Zap size={22} />, name: t("O'g'itlar", 'Удобрения'), color: '#3B82F6' },
    { slug: 'oborudovanie', icon: <Icons.Plug size={22} />, name: t('Uskunalar', 'Оборудование'), color: '#06B6D4' },
    { slug: 'nabory', icon: <Icons.Package size={22} />, name: t("To'plamlar", 'Наборы'), color: '#EF4444' },
  ];

  return (
    <section className="section" id="categories-section">
      <div className="container">
        <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icons.Package size={24} /> {t('Kategoriyalar', 'Категории')}
        </h2>
      </div>
      <div className="categories-scroll">
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.slug}
            href={`/catalog?category=${cat.slug}`}
            className="category-pill"
            id={`cat-${cat.slug}`}
          >
            <span className="category-pill__icon" style={{
              color: cat.color,
              background: `${cat.color}12`,
            }}>
              {cat.icon}
            </span>
            <span className="category-pill__name">{cat.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
