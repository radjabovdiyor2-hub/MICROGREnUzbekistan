'use client';

import React from 'react';
import { ClipboardList, FileText, Flame, Leaf, MessageSquare, Sparkles, Truck } from 'lucide-react';
import type { Product } from './productDetailTypes';
import { ProductSpecsTab } from './ProductSpecsTab';
import { ProductDeliveryTab } from './ProductDeliveryTab';

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

      {activeTab === 'specs' && <ProductSpecsTab product={product} t={t} />}
      {activeTab === 'delivery' && <ProductDeliveryTab t={t} />}
    </>
  );
}
