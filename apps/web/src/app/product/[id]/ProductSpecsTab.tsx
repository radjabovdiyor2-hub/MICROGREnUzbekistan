'use client';

import React from 'react';
import { CheckCircle } from 'lucide-react';
import type { Product } from './productDetailTypes';

export function ProductSpecsTab({
  product,
  t,
}: {
  product: Product;
  t: (uz: string, ru: string) => string;
}) {
  const mergedSpecs: Record<string, string> =
    product.specs && Object.keys(product.specs).length > 0
      ? product.specs
      : product.category?.slug === 'microgreens'
      ? {
          [t("O'sish vaqti", 'Срок выращивания')]: t('7-10 kun', '7-10 дней'),
          [t('Vitaminlar', 'Витамины')]: 'A, B, C, E, K, Sulforaphane',
          [t('Minerallar', 'Минералы')]: t('Temir, Magniy, Kaltsiy, Rux', 'Железо, Магний, Кальций, Цинк'),
          [t("Ta'm", 'Вкус')]: t('Yangi va sersuv', 'Свежий и сочный'),
          // Было «Полезные свойства: иммунитет и детоксикация» — заявление
          // об оздоровительном действии, на которое нужно разрешение Минздрава.
          // Запасная карточка описывает состав, а не эффект.
          [t('Tarkibida', 'В составе')]: t('Kletchatka, vitaminlar', 'Клетчатка, витамины'),
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
    <div className="card" style={{ padding: 'var(--space-6)' }}>
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
            <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={15} style={{ color: 'var(--success)' }} /> {key}
            </span>
            <span style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-primary)' }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
