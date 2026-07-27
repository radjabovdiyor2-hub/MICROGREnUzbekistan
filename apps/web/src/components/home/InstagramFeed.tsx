'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  CheckCircle, Clock, Droplet, Instagram, Leaf, ShoppingCart, Sparkles, Sun, Zap,
} from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { useCart } from '@/components/providers/CartProvider';
import { motion } from 'framer-motion';

// Growing stages timeline — real microgreen growth cycle
const GROW_STAGES = [
  {
    day: 1,
    titleUz: 'Urug\'larni ekish',
    titleRu: 'Посадка семян',
    descUz: 'Sifatli substratga urug\'lar ekiladi va nam muhit yaratiladi',
    descRu: 'Семена высаживаются в качественный субстрат и создаётся влажная среда',
    color: '#8B5CF6',
    icon: 'seed',
  },
  {
    day: 3,
    titleUz: 'Unib chiqish',
    titleRu: 'Прорастание',
    descUz: 'Urug\'lar unib chiqadi, dastlabki ildizlar ko\'rinadi',
    descRu: 'Семена прорастают, появляются первые корешки',
    color: '#10B981',
    icon: 'sprout',
  },
  {
    day: 5,
    titleUz: 'O\'sish bosqichi',
    titleRu: 'Стадия роста',
    descUz: 'Barglar ochiladi, fotosintez boshlanadi. Yorug\'lik va suv muhim',
    descRu: 'Листочки раскрываются, начинается фотосинтез. Свет и вода важны',
    color: '#3B82F6',
    icon: 'grow',
  },
  {
    day: 7,
    titleUz: 'Yig\'im — Tayyor!',
    titleRu: 'Срез — Готово!',
    descUz: 'Mikroko\'katlar to\'liq yetildi. Yangi va sog\'lom holda yetkaziladi',
    descRu: 'Микрозелень полностью созрела. Доставляется свежей и полезной',
    color: '#F59E0B',
    icon: 'harvest',
  },
];

const INSTAGRAM_HANDLE = 'microgreenuzbekistan';
const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}`;

// Fallback mock posts when API is not configured
const FALLBACK_POSTS = [
  { id: '1', caption: 'Bugungi hosilimiz — yangi kesilgan rukkola 🌱', mediaUrl: '', permalink: INSTAGRAM_URL, mediaType: 'IMAGE' },
  { id: '2', caption: 'Qizil karam 3-kunlik o\'sish jarayoni 🌿', mediaUrl: '', permalink: INSTAGRAM_URL, mediaType: 'IMAGE' },
  { id: '3', caption: 'Mijozlarimiz uchun yangi partiya 📦', mediaUrl: '', permalink: INSTAGRAM_URL, mediaType: 'IMAGE' },
  { id: '4', caption: 'Brokkoli mikroko\'kati — vitaminlar xazinasi 💚', mediaUrl: '', permalink: INSTAGRAM_URL, mediaType: 'IMAGE' },
  { id: '5', caption: 'Kungaboqar mikroko\'kati quyoshda ☀️', mediaUrl: '', permalink: INSTAGRAM_URL, mediaType: 'IMAGE' },
  { id: '6', caption: 'Restoranga HoReCa yetkazib berish 🚚', mediaUrl: '', permalink: INSTAGRAM_URL, mediaType: 'IMAGE' },
];

interface InstaPost {
  id: string;
  caption: string;
  mediaUrl: string;
  mediaType: string;
  permalink: string;
  timestamp?: string;
}

interface ShopProduct {
  id: string;
  nameUz: string;
  nameRu?: string;
  price: number;
  slug?: string;
  images?: string[];
}

function StageIcon({ type, size = 24 }: { type: string; size?: number }) {
  if (type === 'seed') return <Droplet size={size} />;
  if (type === 'sprout') return <Leaf size={size} />;
  if (type === 'grow') return <Sun size={size} />;
  if (type === 'harvest') return <CheckCircle size={size} />;
  return <Leaf size={size} />;
}

// Color palette for fallback posts without images
const FALLBACK_COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'];

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

        {/* Growing Timeline */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)',
          marginBottom: 'var(--space-6)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600,
          }}>
            <Clock size={14} />
            {t('7 kunlik o\'sish sikli', '7-дневный цикл выращивания')}
          </div>

          {/* Timeline Steps */}
          <div style={{ display: 'flex', gap: 0, position: 'relative' }}>
            {/* Progress line */}
            <div style={{
              position: 'absolute', top: 20, left: 20, right: 20, height: 3,
              background: 'var(--bg-tertiary)', borderRadius: 2, zIndex: 0,
            }} />
            <div style={{
              position: 'absolute', top: 20, left: 20, height: 3,
              background: `linear-gradient(90deg, ${GROW_STAGES[0].color}, ${GROW_STAGES[activeStage].color})`,
              borderRadius: 2, zIndex: 1,
              width: `${(activeStage / (GROW_STAGES.length - 1)) * (100 - 12)}%`,
              transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
            }} />

            {GROW_STAGES.map((stage, i) => (
              <button key={i} onClick={() => setActiveStage(i)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: '8px', background: 'none', border: 'none', cursor: 'pointer',
                  position: 'relative', zIndex: 2, padding: '0 4px',
                }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--radius-full)',
                  background: i <= activeStage
                    ? `linear-gradient(135deg, ${stage.color}, ${stage.color}DD)`
                    : 'var(--bg-tertiary)',
                  color: i <= activeStage ? 'white' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.3s ease',
                  boxShadow: i === activeStage ? `0 4px 16px ${stage.color}40` : 'none',
                  transform: i === activeStage ? 'scale(1.15)' : 'scale(1)',
                }}>
                  <StageIcon type={stage.icon} size={18} />
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: 700,
                  color: i === activeStage ? stage.color : 'var(--text-muted)',
                  transition: 'color 0.3s',
                }}>
                  {t(`${stage.day}-kun`, `${stage.day} день`)}
                </span>
              </button>
            ))}
          </div>

          {/* Active Stage Info */}
          <div style={{
            marginTop: 'var(--space-4)', padding: 'var(--space-4)',
            background: `${GROW_STAGES[activeStage].color}0A`,
            borderRadius: 'var(--radius-lg)',
            border: `1px solid ${GROW_STAGES[activeStage].color}20`,
            transition: 'all 0.3s ease',
          }}>
            <div style={{
              fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)',
              color: GROW_STAGES[activeStage].color, marginBottom: '4px',
              fontFamily: 'var(--font-display)',
            }}>
              {t(GROW_STAGES[activeStage].titleUz, GROW_STAGES[activeStage].titleRu)}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {t(GROW_STAGES[activeStage].descUz, GROW_STAGES[activeStage].descRu)}
            </div>
          </div>
        </div>

        {/* Instagram Posts Grid — Real or Fallback */}
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
                    : `linear-gradient(135deg, ${FALLBACK_COLORS[i % FALLBACK_COLORS.length]}18, ${FALLBACK_COLORS[i % FALLBACK_COLORS.length]}08)`,
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
                      background: `${FALLBACK_COLORS[i % FALLBACK_COLORS.length]}20`,
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
                  background: 'rgba(0,0,0,0.55)',
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
                    background: 'rgba(0,0,0,0.5)', borderRadius: '4px',
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
                    background: 'rgba(0,0,0,0.5)', borderRadius: '4px',
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
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleBuy(prod); }}
                      style={{
                        position: 'absolute', bottom: 6, left: 6, right: 6, zIndex: 3,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        padding: '6px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: inCart ? 'rgba(16,185,129,0.95)' : 'rgba(255,255,255,0.95)',
                        color: inCart ? '#fff' : '#111', fontSize: 11, fontWeight: 700,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
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

        {/* Live indicator for real API data */}
        {isReal && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '6px', marginTop: 'var(--space-3)',
            fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#10B981',
              animation: 'pulse 2s ease-in-out infinite',
            }} />
            {t('Haqiqiy Instagram postlar', 'Реальные посты из Instagram')}
          </div>
        )}

        {/* CTA Bar */}
        <div style={{
          marginTop: 'var(--space-4)', padding: 'var(--space-4)',
          background: 'linear-gradient(135deg, #833AB420, #C1358420, #E1306C10)',
          borderRadius: 'var(--radius-xl)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 'var(--space-3)',
          border: '1px solid rgba(193, 53, 132, 0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, #833AB4, #E1306C, #F77737)',
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
              background: 'linear-gradient(135deg, #833AB4, #E1306C)',
              color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)',
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px',
              boxShadow: '0 4px 16px rgba(225, 48, 108, 0.3)',
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
