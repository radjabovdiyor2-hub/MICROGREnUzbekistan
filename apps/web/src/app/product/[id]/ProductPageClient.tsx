'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import * as Icons from '@/components/ui/Icons';
import { useCart } from '@/components/providers/CartProvider';
import { useFavorites } from '@/components/providers/FavoritesProvider';
import { useLang } from '@/components/providers/LangProvider';

interface Product {
  id: string;
  nameUz: string;
  nameRu: string;
  slug: string;
  descriptionUz: string | null;
  descriptionRu: string | null;
  price: number;
  oldPrice: number | null;
  images: string[];
  stock: number;
  brand: string | null;
  specs: Record<string, string> | null;
  rating: number;
  reviewCount: number;
  category: { id: string; nameUz: string; nameRu: string; slug: string };
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'microgreens': <Icons.Leaf size={64} />,
  'baby-leaf': <Icons.Leaf size={64} />,
  'salads': <Icons.Leaf size={64} />,
  'flowers': <Icons.Sparkles size={64} />,
  'seeds': <Icons.Droplet size={64} />,
  'equipment': <Icons.Plug size={64} />,
  'sets': <Icons.Package size={64} />,
};

export function ProductPageClient({ id }: { id: string }) {
  const { t } = useLang();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('desc');
  const [quantity, setQuantity] = useState(1);
  const cart = useCart();
  const { toggleFavorite, isFavorite } = useFavorites();

  useEffect(() => {
    async function fetchProduct() {
      try {
        const res = await fetch(`/api/products?id=${id}`);
        if (res.ok) {
          const data = await res.json();
          setProduct(data);
        }
      } catch (err) {
        console.error('Product fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProduct();
  }, [id]);

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-8)', textAlign: 'center' }}>
        <Icons.Clock size={48} style={{ color: 'var(--text-muted)', animation: 'pulse 1.5s infinite' }} />
        <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-4)' }}>{t("Yuklanmoqda...", "Загрузка...")}</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-12)', textAlign: 'center' }}>
        <Icons.Folder size={64} style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }} />
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>{t("Mahsulot topilmadi", "Товар не найден")}</h2>
        <Link href="/catalog" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <Icons.ArrowLeft size={16} /> {t("Katalogga qaytish", "Вернуться в каталог")}
        </Link>
      </div>
    );
  }

  const discount = product.oldPrice ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100) : 0;
  const catIcon = CATEGORY_ICONS[product.category?.slug] || <Icons.Package size={64} />;
  const fav = isFavorite(product.id);

  const handleAddToCart = () => {
    cart.addItem({
      id: product.id,
      nameUz: product.nameUz,
      nameRu: product.nameRu,
      price: product.price,
      oldPrice: product.oldPrice,
      slug: product.slug,
      images: product.images,
      category: product.category,
    }, quantity);
  };

  const handleToggleFav = () => {
    toggleFavorite({
      id: product.id,
      nameUz: product.nameUz,
      nameRu: product.nameRu,
      price: product.price,
      oldPrice: product.oldPrice,
      slug: product.slug,
      images: product.images,
      rating: product.rating,
      category: product.category,
    });
  };

  const TABS = [
    { id: 'desc', labelUz: "Tavsif", labelRu: "Описание", icon: <Icons.FileText size={14} /> },
    { id: 'specs', labelUz: "Xususiyatlar", labelRu: "Характеристики", icon: <Icons.ClipboardList size={14} /> },
    { id: 'delivery', labelUz: "Yetkazish", labelRu: "Доставка", icon: <Icons.Truck size={14} /> },
  ];

  return (
    <div className="container" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
        <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Icons.Home size={14} /> {t("Bosh sahifa", "Главная")}
        </Link>
        <Icons.ChevronRight size={14} />
        <Link href="/catalog" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{t("Katalog", "Каталог")}</Link>
        <Icons.ChevronRight size={14} />
        <span style={{ color: 'var(--text-primary)' }}>{t(product.nameUz, product.nameRu)}</span>
      </div>

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-8)', alignItems: 'start' }}>
        {/* Image */}
        <div className="card" style={{
          aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-tertiary)', color: 'var(--text-muted)', position: 'relative', overflow: 'hidden',
        }}>
          {discount > 0 && (
            <span style={{
              position: 'absolute', top: 12, left: 12, zIndex: 2,
              padding: '6px 12px', background: 'var(--error)', color: 'white',
              borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              <Icons.Flame size={14} /> -{discount}%
            </span>
          )}
          {product.images && product.images.length > 0
            ? <Image src={product.images[0]} alt={product.nameUz} width={600} height={600} style={{ width: '100%', height: '100%', objectFit: 'cover' }} priority quality={80} sizes="(max-width: 768px) 100vw, 50vw" unoptimized={!product.images[0].startsWith('https://') && !product.images[0].startsWith('http://')} />
            : catIcon}
        </div>

        {/* Info */}
        <div>
          {product.brand && (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>
              {product.brand}
            </div>
          )}
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-3)' }}>
            {t(product.nameUz, product.nameRu)}
          </h1>

          {/* Rating */}
          {product.rating > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', gap: '2px' }}>
                {[1,2,3,4,5].map(s => (
                  s <= Math.round(product.rating)
                    ? <Icons.StarFilled key={s} size={18} style={{ color: '#F59E0B' }} />
                    : <Icons.Star key={s} size={18} style={{ color: 'var(--border)' }} />
                ))}
              </div>
              <span style={{ fontWeight: 'var(--font-semibold)' }}>{product.rating}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>({product.reviewCount} {t("ta sharh", "отзывов")})</span>
            </div>
          )}

          {/* Stock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
            {product.stock > 0 ? (
              <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Icons.CheckCircle size={16} /> {t(`Mavjud (${product.stock} dona)`, `В наличии (${product.stock} шт)`)}
              </span>
            ) : (
              <span style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Icons.XCircle size={16} /> {t("Tugagan", "Нет в наличии")}
              </span>
            )}
          </div>

          {/* Price */}
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-3xl)', color: 'var(--brand-primary)' }}>
              {fmt(product.price)} {t("so'm", "сум")}
            </div>
            {product.oldPrice && (
              <div style={{ fontSize: 'var(--text-lg)', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                {fmt(product.oldPrice)} {t("so'm", "сум")}
              </div>
            )}
          </div>

          {/* Quantity + Cart */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="btn btn-ghost"
                style={{ width: 44, height: 44, borderRadius: 0 }}>
                <Icons.Minus size={16} />
              </button>
              <span style={{ width: 44, textAlign: 'center', fontWeight: 'var(--font-bold)' }}>{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="btn btn-ghost"
                style={{ width: 44, height: 44, borderRadius: 0 }}>
                <Icons.Plus size={16} />
              </button>
            </div>
            <button className="btn btn-primary btn-lg" onClick={handleAddToCart}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              disabled={product.stock === 0}>
              <Icons.ShoppingCart size={20} /> {t("Savatga qo'shish", "В корзину")}
            </button>
          </div>

          {/* Secondary buttons */}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button onClick={handleToggleFav} className="btn btn-outline"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: fav ? 'var(--error)' : undefined }}>
              {fav ? <Icons.HeartFilled size={18} /> : <Icons.Heart size={18} />} {t("Sevimli", "В избранное")}
            </button>
            <a href="tel:+998949999599" className="btn btn-outline"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <Icons.Phone size={18} /> {t("Qo'ng'iroq", "Позвонить")}
            </a>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginTop: 'var(--space-8)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', borderBottom: '2px solid var(--border)', marginBottom: 'var(--space-4)' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {tab.icon} {t(tab.labelUz, tab.labelRu)}
            </button>
          ))}
        </div>

        {activeTab === 'desc' && (
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <p style={{ lineHeight: 1.8 }}>{t(product.descriptionUz || "Bu mahsulot haqida batafsil ma'lumot tez orada qo'shiladi.", product.descriptionRu || "Подробная информация об этом товаре будет добавлена в ближайшее время.")}</p>
          </div>
        )}

        {activeTab === 'specs' && (
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            {product.specs ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {Object.entries(product.specs).map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Icons.CheckCircle size={14} style={{ color: 'var(--success)' }} /> {key}
                    </span>
                    <span style={{ fontWeight: 'var(--font-semibold)' }}>{val}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>{t("Xususiyatlar tez orada qo'shiladi", "Характеристики будут добавлены в ближайшее время")}</p>
            )}
          </div>
        )}

        {activeTab === 'delivery' && (
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <Icons.Truck size={24} style={{ color: 'var(--brand-primary)' }} />
                <div>
                  <div style={{ fontWeight: 'var(--font-semibold)' }}>{t("Yetkazib berish", "Доставка")}</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{t("30-90 daqiqada · 25 000 so'm (500K dan bepul)", "За 30-90 минут · 25 000 сум (от 500К бесплатно)")}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <Icons.MapPin size={24} style={{ color: 'var(--brand-primary)' }} />
                <div>
                  <div style={{ fontWeight: 'var(--font-semibold)' }}>{t("O'zingiz olib ketish", "Самовывоз")}</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{t("Ray senter, Hokimiyat yonida", "Райцентр, возле Хокимията")}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <Icons.Phone size={24} style={{ color: 'var(--brand-primary)' }} />
                <div>
                  <div style={{ fontWeight: 'var(--font-semibold)' }}>{t("Maslahat", "Консультация")}</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>+998 94 999 95 99</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
