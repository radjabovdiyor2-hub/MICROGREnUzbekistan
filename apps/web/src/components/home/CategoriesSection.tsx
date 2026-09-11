'use client';

import Link from 'next/link';
import { Package } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { motion } from 'framer-motion';
import { tint } from '@/lib/tint';
import { CATALOG_SECTIONS, sectionHref } from '@/lib/catalogSections';

// ══════════════════════════════════════════════════════════════════════
// Разделы на главной.
//
// СПИСОК ОБЩИЙ С КАТАЛОГОМ (`@/lib/catalogSections`), а не свой. Свой был, и
// он молча разошёлся: главная звала в «Цветы», «Семена» и «Оборудование» —
// три рубрики, в которых после перехода на прайс из 70 позиций НЕТ НИ ОДНОГО
// активного товара. Человек нажимал и попадал в пустую комнату. Обратное
// расхождение тоже было: соусов и четырёх линеек, которые в каталоге есть, на
// главной не было вовсе.
//
// ПЛИТКИ ОДНОГО РАЗМЕРА. Ширину задавала длина слова: «BALANS» выходил уже
// «Оборудования» в полтора раза, и ряд читался как случайный набор кнопок.
// Теперь ширина одна (`.categories-scroll .category-pill` в globals.css), а
// значок есть у каждой плитки — без него она ещё и ниже соседей.
// ══════════════════════════════════════════════════════════════════════

const spring = { type: 'spring' as const, damping: 20, stiffness: 300 };

export function CategoriesSection() {
  const { t } = useLang();

  return (
    <section className="section" id="categories-section">
      <div className="container">
        <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Package size={24} /> {t('Bo‘limlar', 'Разделы')}
        </h2>
      </div>
      <div className="categories-wrapper">
        <div className="categories-scroll">
          {CATALOG_SECTIONS.map((section) => {
            const Icon = section.Icon;
            return (
            <motion.div
              key={`${section.kind}-${section.slug || 'all'}`}
              whileHover={{ scale: 1.06, y: -2 }}
              whileTap={{ scale: 0.95 }}
              transition={spring}
            >
              <Link
                href={sectionHref(section)}
                className="category-pill"
                id={`cat-${section.slug || 'all'}`}
                onClick={() => {
                  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
                    window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                  }
                }}
              >
                <span className="category-pill__icon" style={{
                  color: section.color,
                  background: `${tint(section.color, 7)}`,
                }}>
                  <Icon size={22} />
                </span>
                {/* `translate="no"` — Chrome на телефоне переводил KUNLIK в
                    «ЕЖЕДНЕВНО», а «Бейби лист» в «Список малышей»: имя
                    переставало быть именем, и человек не узнавал на упаковке
                    то, что прочитал на сайте. */}
                <span className="category-pill__name" translate="no">
                  {t(section.nameUz, section.nameRu)}
                </span>
              </Link>
            </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
