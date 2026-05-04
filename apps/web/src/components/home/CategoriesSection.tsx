'use client';

import Link from 'next/link';
import * as Icons from '@/components/ui/Icons';
import { useLang } from '@/components/providers/LangProvider';

export function CategoriesSection() {
  const { t } = useLang();

  const CATEGORIES = [
    { slug: 'microgreens', icon: <Icons.Leaf size={22} />, name: t("Mikroko'katlar", 'Микрозелень'), color: '#10B981' },
    { slug: 'baby-leaf', icon: <Icons.Leaf size={22} />, name: t('Baby Leaf', 'Бейби лист'), color: '#22C55E' },
    { slug: 'salads', icon: <Icons.Leaf size={22} />, name: t('Salatlar', 'Салаты'), color: '#34D399' },
    { slug: 'flowers', icon: <Icons.Sparkles size={22} />, name: t('Gullar', 'Цветы'), color: '#EC4899' },
    { slug: 'seeds', icon: <Icons.Droplet size={22} />, name: t("Urug'lar", 'Семена'), color: '#F59E0B' },
    { slug: 'equipment', icon: <Icons.Plug size={22} />, name: t('Uskunalar', 'Оборудование'), color: '#06B6D4' },
    { slug: 'sets', icon: <Icons.Package size={22} />, name: t("To'plamlar", 'Наборы'), color: '#EF4444' },
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
