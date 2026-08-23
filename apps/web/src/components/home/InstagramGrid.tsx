'use client';

import Image from 'next/image';
import { Instagram, Leaf, ShoppingCart, Sparkles, Zap } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { FALLBACK_COLORS, INSTAGRAM_URL, type InstaPost } from './instagramFeedData';
import type { ShopProduct } from './instagramFeedData';
import { tint } from '@/lib/tint';

// Сетка постов Instagram: настоящие из API либо заглушки.
// Вынесено из InstagramFeed: файл перерос 200 строк.

export function InstagramGrid({ posts, loading, addedId, findProduct, onBuy }: {
  posts: InstaPost[];
  loading: boolean;
  addedId: string | null;
  findProduct: (caption?: string) => ShopProduct | null;
  onBuy: (p: ShopProduct) => void;
}) {
  const { t } = useLang();

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '4px',
      borderRadius: 'var(--radius-xl)',
      overflow: 'hidden',
    }}>
      {loading ? (
        // Skeleton loading
        Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ aspectRatio: '1' }} />
        ))
      ) : (
        posts.slice(0, 9).map((post, i) => (
          <a
            key={post.id}
            href={post.permalink || INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              aspectRatio: '1',
              position: 'relative',
              overflow: 'hidden',
              display: 'block',
              background: post.mediaUrl
                ? 'var(--bg-tertiary)'
                : `linear-gradient(135deg, ${tint(FALLBACK_COLORS[i % FALLBACK_COLORS.length], 9)}, ${tint(FALLBACK_COLORS[i % FALLBACK_COLORS.length], 3)})`,
              border: '1px solid var(--border)',
            }}
          >
            {/* Real Instagram Image */}
            {post.mediaUrl ? (
              <Image
                src={post.mediaUrl}
                alt={post.caption?.slice(0, 100) || 'Instagram post'}
                fill
                style={{ objectFit: 'cover', transition: 'transform 0.3s ease' }}
                sizes="(max-width: 768px) 33vw, 200px"
                unoptimized // Instagram CDN handles optimization
                onError={(e) => {
                  // Hide broken images
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              // Fallback — icon + caption
              <div style={{
                width: '100%', height: '100%',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '12px',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 'var(--radius-full)',
                  background: `${tint(FALLBACK_COLORS[i % FALLBACK_COLORS.length], 13)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: FALLBACK_COLORS[i % FALLBACK_COLORS.length],
                  marginBottom: '8px',
                }}>
                  <Leaf size={22} />
                </div>
                <div style={{
                  fontSize: '11px', fontWeight: 600, textAlign: 'center',
                  color: 'var(--text-secondary)',
                  display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  lineHeight: 1.4,
                }}>
                  {post.caption}
                </div>
              </div>
            )}

            {/* Hover overlay with caption */}
            <div className="insta-overlay" style={{
              position: 'absolute', inset: 0,
              background: 'rgba(var(--overlay-dark-rgb), 0.55)',
              opacity: 0,
              transition: 'opacity 0.25s ease',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '12px', cursor: 'pointer',
            }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '0'; }}
            >
              <Instagram size={24} color="white" />
              {post.caption && (
                <p style={{
                  color: 'white', fontSize: '11px', textAlign: 'center',
                  marginTop: '8px', lineHeight: 1.4,
                  display: '-webkit-box', WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {post.caption.slice(0, 120)}
                </p>
              )}
            </div>

            {/* Video badge */}
            {post.mediaType === 'VIDEO' && (
              <div style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(var(--overlay-dark-rgb), 0.5)', borderRadius: '4px',
                padding: '2px 6px', color: 'white', fontSize: '10px',
                display: 'flex', alignItems: 'center', gap: '3px',
              }}>
                <Zap size={10} /> Video
              </div>
            )}

            {/* Carousel badge */}
            {post.mediaType === 'CAROUSEL_ALBUM' && (
              <div style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(var(--overlay-dark-rgb), 0.5)', borderRadius: '4px',
                padding: '2px 6px', color: 'white', fontSize: '10px',
              }}>
                <Sparkles size={10} />
              </div>
            )}

            {/* Shoppable — кнопка «Купить», если товар найден в подписи поста */}
            {(() => {
              const prod = findProduct(post.caption);
              if (!prod) return null;
              const inCart = addedId === prod.id;
              return (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBuy(prod); }}
                  style={{
                    position: 'absolute', bottom: 6, left: 6, right: 6, zIndex: 3,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    padding: '6px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: inCart ? 'rgba(var(--brand-primary-rgb),0.95)' : 'rgba(var(--overlay-light-rgb), 0.95)',
                    color: inCart ? 'rgb(var(--overlay-light-rgb))' : 'var(--text-primary)', fontSize: 11, fontWeight: 700,
                    boxShadow: '0 2px 8px rgba(var(--overlay-dark-rgb), 0.25)',
                  }}
                >
                  <ShoppingCart size={12} />
                  {inCart
                    ? t('Savatda ✓', 'В корзине ✓')
                    : `${t('Sotib olish', 'Купить')} · ${prod.price.toLocaleString('ru-RU')}`}
                </button>
              );
            })()}
          </a>
        ))
      )}
    </div>
  );
}
