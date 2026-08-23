'use client';

import Link from 'next/link';
import {
  Droplet, Leaf, Package, Plug, Salad, Sparkles,
} from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { motion } from 'framer-motion';
import { tint } from '@/lib/tint';

const spring = { type: 'spring' as const, damping: 20, stiffness: 300 };

export function CategoriesSection() {
  const { t } = useLang();

  const CATEGORIES = [
    { slug: 'microgreens', icon: <Leaf size={22} />, name: t("Mikroko'katlar", 'Микрозелень'), color: 'var(--brand-primary)' },
    { slug: 'baby-leaf', icon: <Leaf size={22} />, name: t('Baby Leaf', 'Бейби лист'), color: 'var(--cat-7)' },
    { slug: 'salads', icon: <Leaf size={22} />, name: t('Salatlar', 'Салаты'), color: 'var(--brand-primary)' },
    { slug: 'balans', icon: <Salad size={22} />, name: 'BALANS', color: 'var(--cat-2)' },
    { slug: 'flowers', icon: <Sparkles size={22} />, name: t('Gullar', 'Цветы'), color: 'var(--cat-3)' },
    { slug: 'seeds', icon: <Droplet size={22} />, name: t("Urug'lar", 'Семена'), color: 'var(--warning)' },
    { slug: 'equipment', icon: <Plug size={22} />, name: t('Uskunalar', 'Оборудование'), color: 'var(--cat-12)' },
    { slug: 'sets', icon: <Package size={22} />, name: t("To'plamlar", 'Наборы'), color: 'var(--error)' },
  ];

  return (
    <section className="section" id="categories-section">
      <div className="container">
        <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Package size={24} /> {t('Kategoriyalar', 'Категории')}
        </h2>
      </div>
      <div className="categories-wrapper">
        <div className="categories-scroll">
          {CATEGORIES.map((cat) => (
            <motion.div
              key={cat.slug}
              whileHover={{ scale: 1.06, y: -2 }}
              whileTap={{ scale: 0.95 }}
              transition={spring}
            >
              <Link
                href={`/catalog/${cat.slug}`}
                className="category-pill"
                id={`cat-${cat.slug}`}
                onClick={() => {
                  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
                    window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                  }
                }}
              >
                <span className="category-pill__icon" style={{
                  color: cat.color,
                  background: `${tint(cat.color, 7)}`,
                }}>
                  {cat.icon}
                </span>
                <span className="category-pill__name">{cat.name}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
