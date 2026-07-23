'use client';

import Link from 'next/link';
import { Folder, Heart } from 'lucide-react';
import { useFavorites } from '@/components/providers/FavoritesProvider';
import { useLang } from '@/components/providers/LangProvider';
import { ProductCard } from '@/components/shop/ProductCard';
import { motion, AnimatePresence } from 'framer-motion';
import { LottieAnimation } from '@/components/ui/LottieAnimation';
import emptyState from '@/assets/lottie/empty-state.json';

const spring = { type: 'spring' as const, damping: 25, stiffness: 120 };

export default function FavoritesPage() {
  const { t } = useLang();
  const { favorites } = useFavorites();

  return (
    <motion.div
      className="container"
      style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, duration: 0.4 }}
    >
      <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Heart fill="currentColor" size={28} style={{ color: 'var(--error)' }} /> {t('Sevimlilar', 'Избранное')}
        {favorites.length > 0 && (
          <motion.span
            key={favorites.length}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={spring}
            style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontWeight: 'var(--font-normal)' }}
          >
            ({favorites.length})
          </motion.span>
        )}
      </h1>

      <AnimatePresence mode="wait">
        {favorites.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={spring}
            style={{ textAlign: 'center', padding: 'var(--space-12) var(--space-4)', color: 'var(--text-muted)' }}
          >
            <LottieAnimation
              animationData={emptyState}
              loop
              style={{ width: 180, height: 180, margin: '0 auto var(--space-4)' }}
            />
            <h3 style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
              {t("Sevimlilar bo'sh", "В избранном пусто")}
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
              {t("Mahsulot kartalaridagi yurak belgisini bosing", "Нажмите на сердечко в карточках товаров")}
            </p>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Link href="/catalog" className="btn btn-primary btn-lg" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Folder size={20} /> {t("Katalogga o'tish", "Перейти в каталог")}
              </Link>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            {favorites.map(fav => (
              <motion.div
                key={fav.id}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  visible: { opacity: 1, y: 0 },
                }}
                transition={spring}
              >
                <ProductCard
                  product={{
                    ...fav,
                    nameRu: fav.nameRu || fav.nameUz,
                    rating: fav.rating || 0,
                    reviewCount: 0,
                  }}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
