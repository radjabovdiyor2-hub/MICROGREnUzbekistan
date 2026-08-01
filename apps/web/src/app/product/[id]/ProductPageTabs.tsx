'use client';

import React from 'react';
import {
  CheckCircle, ClipboardList, FileText, Flame, Leaf, MapPin, MessageSquare, Phone, Sparkles, Truck,
} from 'lucide-react';
import type { Product } from './ProductPageClient';

export function ProductPageTabs({
  activeTab,
  setActiveTab,
  product,
  t,
}: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  product: Product;
  t: (uz: string, ru: string) => string;
}) {
  const TABS = [
    { id: 'desc', labelUz: 'Tavsif', labelRu: 'Описание', icon: <FileText size={14} /> },
    { id: 'specs', labelUz: 'Xususiyatlar', labelRu: 'Характеристики', icon: <ClipboardList size={14} /> },
    { id: 'delivery', labelUz: 'Yetkazish', labelRu: 'Доставка', icon: <Truck size={14} /> },
    { id: 'reviews', labelUz: 'Sharhlar', labelRu: 'Отзывы', icon: <MessageSquare size={14} /> },
  ];

  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '2px solid var(--border)',
          marginBottom: 'var(--space-4)',
          overflowX: 'auto',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexShrink: 0,
              padding: 'var(--space-3) var(--space-4)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontWeight: activeTab === tab.id ? 'var(--font-bold)' : 'var(--font-medium)',
              fontSize: 'var(--text-sm)',
              color: activeTab === tab.id ? 'var(--brand-primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === tab.id ? '3px solid var(--brand-primary)' : '3px solid transparent',
              marginBottom: '-2px',
              transition: 'all var(--transition-fast)',
            }}
          >
            {tab.icon} {t(tab.labelUz, tab.labelRu)}
            {tab.id === 'reviews' && product.reviewCount > 0 && (
              <span
                style={{
                  background:
                    activeTab === 'reviews'
                      ? 'color-mix(in srgb, var(--brand-primary) 14%, transparent)'
                      : 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '11px',
                  padding: '0 6px',
                  fontWeight: 'var(--font-bold)',
                }}
              >
                {product.reviewCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'desc' && (
        <div className="card" style={{ padding: 'var(--space-6)' }}>
          <p style={{ lineHeight: 1.8, fontSize: 'var(--text-base)', marginBottom: 'var(--space-4)' }}>
            {t(
              product.descriptionUz ||
                `${product.nameUz} — ekologik toza substratda o'stirilgan, 100% tabiiy va vitaminlarga boy mahsulot. Tarkibida yuqori konsentratsiyali antiosidantlar va minerallar mavjud.`,
              product.descriptionRu ||
                `${product.nameRu} — 100% натуральный свежий продукт, выращенный на экологически чистом субстрате. Содержит высокую концентрацию антиоксидантов, витаминов и микроэлементов.`,
            )}
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'var(--space-4)' }}>
            <span
              style={{
                padding: '6px 12px',
                background: 'var(--success-bg)',
                color: 'var(--success)',
                borderRadius: 'var(--radius-full)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Sparkles size={12} /> {t('100% Ekologik toza', '100% Эко продукт')}
            </span>
            <span
              style={{
                padding: '6px 12px',
                background: 'color-mix(in srgb, var(--cat-1) 12%, transparent)',
                color: 'var(--cat-1)',
                borderRadius: 'var(--radius-full)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Leaf size={12} /> {t('Vitaminlar: A, C, E, K, B-complex', 'Витамины: A, C, E, K, B-комплекс')}
            </span>
            <span
              style={{
                padding: '6px 12px',
                background: 'var(--warning-bg)',
                color: 'var(--warning)',
                borderRadius: 'var(--radius-full)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Flame size={12} /> {t('Antioksidant & Detox', 'Антиоксидант и Детокс')}
            </span>
          </div>
        </div>
      )}

      {activeTab === 'specs' && (
        <div className="card" style={{ padding: 'var(--space-6)' }}>
          {(() => {
            const mergedSpecs: Record<string, string> =
              product.specs && Object.keys(product.specs).length > 0
                ? product.specs
                : product.category?.slug === 'microgreens'
                ? {
                    [t("O'sish vaqti", 'Срок выращивания')]: t('7-10 kun', '7-10 дней'),
                    [t('Vitaminlar', 'Витамины')]: 'A, B, C, E, K, Sulforaphane',
                    [t('Minerallar', 'Минералы')]: t('Temir, Magniy, Kaltsiy, Rux', 'Железо, Магний, Кальций, Цинк'),
                    [t("Ta'm", 'Вкус')]: t('Yangi va sersuv', 'Свежий и сочный'),
                    [t('Foydali xususiyati', 'Полезные свойства')]: t(
                      'Immunitet va hazm qilish',
                      'Иммунитет и детоксикация',
                    ),
                    [t('Saqlash harorati', 'Температура хранения')]: '2°C — 5°C',
                    [t('Yaroqlilik muddati', 'Срок годности')]: t('7 kun', '7 дней'),
                  }
                : product.category?.slug === 'seeds'
                ? {
                    [t('Unuvchanligi', 'Всхожесть')]: '98%',
                    [t('Tozaligi', 'Чистота')]: '99.5%',
                    [t('Vazni', 'Вес')]: t('50g — 200g paket', '50г — 200г пачка'),
                    [t('Saqlash muddati', 'Срок годности')]: t('24 oy', '24 месяца'),
                  }
                : {
                    [t('Kafolat', 'Гарантия')]: t('Sifat kafolati 100%', 'Гарантия качества 100%'),
                    [t('Ishlab chiqaruvchi', 'Производитель')]: 'Microgreen Uzbekistan',
                    [t('Yetkazib berish', 'Доставка')]: t("Bugunning o'zida", 'В день заказа'),
                  };

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {Object.entries(mergedSpecs).map(([key, val]) => (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: 'var(--space-3) 0',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 'var(--text-sm)',
                    }}
                  >
                    <span
                      style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <CheckCircle size={15} style={{ color: 'var(--success)' }} /> {key}
                    </span>
                    <span style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-primary)' }}>
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {activeTab === 'delivery' && (
        <div className="card" style={{ padding: 'var(--space-6)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {[
              {
                icon: <Truck size={24} />,
                title: t('Yetkazib berish', 'Доставка'),
                sub: t(
                  "30-90 daqiqada · 25 000 so'm (500K dan bepul)",
                  'За 30-90 минут · 25 000 сум (от 500К бесплатно)',
                ),
              },
              {
                icon: <MapPin size={24} />,
                title: t("O'zingiz olib ketish", 'Самовывоз'),
                sub: t('Ray senter, Hokimiyat yonida', 'Райцентр, возле Хокимията'),
              },
              { icon: <Phone size={24} />, title: t('Maslahat', 'Консультация'), sub: '+998 94 999 95 99' },
            ].map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span style={{ color: 'var(--brand-primary)', flexShrink: 0 }}>{d.icon}</span>
                <div>
                  <div style={{ fontWeight: 'var(--font-semibold)' }}>{d.title}</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{d.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
