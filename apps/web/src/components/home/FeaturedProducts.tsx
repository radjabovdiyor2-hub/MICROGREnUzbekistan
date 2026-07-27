'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProductCard } from '@/components/shop/ProductCard';
import { ArrowRight, Star } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { motion } from 'framer-motion';

const spring = { type: 'spring' as const, damping: 25, stiffness: 120 };

interface Product {
  id: string;
  nameUz: string;
  nameRu: string;
  slug: string;
  price: number;
  oldPrice?: number | null;
  images: string[];
  rating: number;
  reviewCount: number;
  isOnSale?: boolean;
  category?: { nameUz: string; slug: string };
}

export function FeaturedProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLang();

  useEffect(() => {
    fetch('/api/products?featured=true&limit=6')
      .then(r => r.json())
      .then(data => {
        setProducts(data.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <section className="section" id="featured-section">
      <div className="container">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 'var(--space-6)', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div>
            <h2 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Star fill="currentColor" strokeWidth={1} size={24} style={{ color: 'var(--brand-accent)' }} /> {t('Haftaning xitlari', 'Хиты недели')}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: '4px' }}>
              {t("Mijozlarimiz eng ko'p tanlaydigan mahsulotlar", 'То, что чаще всего выбирают наши клиенты')}
            </p>
          </div>
          <Link href="/catalog" className="btn btn-outline btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {t('featured.all')} <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="product-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card" style={{ overflow: 'hidden' }}>
                <div className="skeleton" style={{ width: '100%', aspectRatio: '1' }} />
                <div style={{ padding: 'var(--space-3)' }}>
                  <div className="skeleton" style={{ width: '60%', height: 12, marginBottom: 8, borderRadius: 6 }} />
                  <div className="skeleton" style={{ width: '90%', height: 14, marginBottom: 8, borderRadius: 6 }} />
                  <div className="skeleton" style={{ width: '40%', height: 16, borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <motion.div
            className="product-grid"
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
          >
            {products.map((product) => (
              <motion.div
                key={product.id}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0 },
                }}
                transition={spring}
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </section>
  );
}
