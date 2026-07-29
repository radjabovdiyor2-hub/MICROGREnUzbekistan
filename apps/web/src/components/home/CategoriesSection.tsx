'use client';

import Link from 'next/link';
import {
  Droplet, Leaf, Package, Plug, Sparkles,
} from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { motion } from 'framer-motion';

const spring = { type: 'spring' as const, damping: 20, stiffness: 300 };

export function CategoriesSection() {
  const { t } = useLang();

  const CATEGORIES = [
    { slug: 'microgreens', icon: <Leaf size={22} />, name: t("Mikroko'katlar", 'Микрозелень'), color: '#10B981' },
    { slug: 'baby-leaf', icon: <Leaf size={22} />, name: t('Baby Leaf', 'Бейби лист'), color: '#22C55E' },
    { slug: 'salads', icon: <Leaf size={22} />, name: t('Salatlar', 'Салаты'), color: '#34D399' },
    { slug: 'flowers', icon: <Sparkles size={22} />, name: t('Gullar', 'Цветы'), color: '#EC4899' },
    { slug: 'seeds', icon: <Droplet size={22} />, name: t("Urug'lar", 'Семена'), color: '#F59E0B' },
    { slug: 'equipment', icon: <Plug size={22} />, name: t('Uskunalar', 'Оборудование'), color: '#06B6D4' },
    { slug: 'sets', icon: <Package size={22} />, name: t("To'plamlar", 'Наборы'), color: '#EF4444' },
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
                  background: `${cat.color}12`,
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
