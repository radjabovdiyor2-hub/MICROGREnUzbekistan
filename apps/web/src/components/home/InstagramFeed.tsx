'use client';

import { useState, useEffect } from 'react';
import { Instagram, Leaf } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { useCart } from '@/components/providers/CartProvider';
import { motion } from 'framer-motion';
import { GrowingTimeline } from './GrowingTimeline';
import { InstagramGrid } from './InstagramGrid';

import {
  FALLBACK_POSTS, INSTAGRAM_HANDLE,
  INSTAGRAM_URL,
  type InstaPost, type ShopProduct,
} from './instagramFeedData';

export function InstagramFeed() {
  const { t } = useLang();
  const [activeStage, setActiveStage] = useState(3);
  const [posts, setPosts] = useState<InstaPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isReal, setIsReal] = useState(false);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [addedId, setAddedId] = useState<string | null>(null);
  const cart = useCart();

  // Каталог для «shoppable»: сопоставляем товар из подписи поста
  useEffect(() => {
    let mounted = true;
    fetch('/api/products?limit=100')
      .then(r => r.json())
      .then(data => {
        const list: ShopProduct[] = data.items || data.products || [];
        if (mounted && Array.isArray(list)) setProducts(list);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const findProduct = (caption?: string): ShopProduct | null => {
    if (!caption || products.length === 0) return null;
    const c = caption.toLowerCase();
    for (const p of products) {
      const names = [p.nameUz, p.nameRu].filter(Boolean) as string[];
      for (const nm of names) {
        const words = nm.toLowerCase().split(/[^a-zа-яё0-9']+/i).filter(w => w.length >= 4);
        if (words.some(w => c.includes(w))) return p;
      }
    }
    return null;
  };

  const handleBuy = (p: ShopProduct) => {
    cart.addItem({
      id: p.id, nameUz: p.nameUz, nameRu: p.nameRu, price: p.price,
      slug: p.slug || p.id, images: p.images || [],
    });
    setAddedId(p.id);
    setTimeout(() => setAddedId(cur => (cur === p.id ? null : cur)), 2000);
  };

  useEffect(() => {
    let mounted = true;
    fetch('/api/instagram')
      .then(r => r.json())
      .then(data => {
        if (!mounted) return;
        if (data.posts && data.posts.length > 0) {
          setPosts(data.posts.slice(0, 9));
          setIsReal(true);
        } else {
          setPosts(FALLBACK_POSTS);
        }
      })
      .catch(() => {
        if (mounted) setPosts(FALLBACK_POSTS);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  return (
    <section style={{
      padding: 'var(--space-10) 0', background: 'var(--bg-primary)',
      borderTop: '1px solid var(--border)',
    }}>
      <div className="container">
        {/* Section Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)',
        }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)',
              fontSize: 'var(--text-2xl)', display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <Leaf size={24} style={{ color: 'var(--brand-primary)' }} />
              {t("O'sish jarayoni", 'Процесс выращивания')}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: '4px' }}>
              {t(
                "Urug'dan stolga — har bir bosqichni Instagramda kuzating",
                'От семечка до стола — следите за каждым этапом в Instagram'
              )}
            </p>
          </div>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer"
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            id="instagram-follow-btn"
          >
            <Instagram size={16} />
            {t("Obuna bo'lish", 'Подписаться')}
          </a>
        </div>

        <GrowingTimeline activeStage={activeStage} setActiveStage={setActiveStage} />


        <InstagramGrid posts={posts} loading={loading} addedId={addedId}
          findProduct={findProduct} onBuy={handleBuy} />


        {/* Live indicator for real API data */}
        {isReal && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '6px', marginTop: 'var(--space-3)',
            fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--brand-primary)',
              animation: 'pulse 2s ease-in-out infinite',
            }} />
            {t('Haqiqiy Instagram postlar', 'Реальные посты из Instagram')}
          </div>
        )}

        {/* CTA Bar */}
        <div style={{
          marginTop: 'var(--space-4)', padding: 'var(--space-4)',
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--social-instagram-purple) 12%, transparent), color-mix(in srgb, var(--social-instagram-deep) 12%, transparent), color-mix(in srgb, var(--social-instagram) 6%, transparent))',
          borderRadius: 'var(--radius-xl)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 'var(--space-3)',
          border: '1px solid color-mix(in srgb, var(--social-instagram-deep) 15%, transparent)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, var(--social-instagram-purple), var(--social-instagram), var(--social-instagram-amber))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white',
            }}>
              <Instagram size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)' }}>
                @{INSTAGRAM_HANDLE}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {t(
                  "Har kuni yangi kontent — o'sish, yig'im, retseptlar",
                  'Ежедневный контент — рост, урожай, рецепты'
                )}
              </div>
            </div>
          </div>
          <motion.a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              padding: '10px 24px', border: 'none',
              background: 'linear-gradient(135deg, var(--social-instagram-purple), var(--social-instagram))',
              color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)',
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px',
              boxShadow: '0 4px 16px color-mix(in srgb, var(--social-instagram) 30%, transparent)',
            }}
          >
            <Instagram size={16} />
            {t("Instagram ochish", 'Открыть Instagram')}
          </motion.a>
        </div>
      </div>
    </section>
  );
}
