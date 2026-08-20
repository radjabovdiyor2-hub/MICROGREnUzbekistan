'use client';

import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Minus, Package, Plus, Trash } from 'lucide-react';
import type { useCart } from '@/components/providers/CartProvider';

const spring = { type: 'spring' as const, damping: 25, stiffness: 120 };

interface Props {
  cart: ReturnType<typeof useCart>;
  fmt: (n: number) => string;
  t: (uz: string, ru: string) => string;
}

export function CartItemList({ cart, fmt, t }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {cart.items.map((item, idx) => (
        <motion.div
          key={item.product.id}
          className="card hover-lift"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: Math.min(idx * 0.06, 0.3) }}
          style={{
            padding: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap',
          }}
        >
          <div style={{
            width: 72, height: 72, borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0, color: 'var(--text-muted)',
          }}>
            {item.product.images && item.product.images.length > 0
              ? <Image src={item.product.images[0]} alt={item.product.nameUz} width={72} height={72} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-lg)' }} quality={70} />
              : <Package size={32} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-1)', fontSize: 'var(--text-sm)' }}>
              {t(item.product.nameUz, item.product.nameRu || item.product.nameUz)}
            </div>
            <div style={{ color: 'var(--brand-primary)', fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)' }}>
              {fmt(item.product.price)} {t("so'm", "сум")}
              {/* Единица идёт при цене за штуку, но НЕ при сумме строки справа:
                  там уже цена × количество, и «/ кг» читалось бы как цена. */}
              {item.product.unit && (
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-normal)', color: 'var(--text-muted)' }}>
                  {' / '}{item.product.unit}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => cart.updateQuantity(item.product.id, item.quantity - 1)}
              style={{ width: 36, height: 36, borderRadius: 'var(--radius-full)', border: '1px solid var(--border)' }}>
              <Minus size={16} />
            </button>
            <span style={{ fontWeight: 'var(--font-bold)', width: 28, textAlign: 'center' }}>{item.quantity}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => cart.updateQuantity(item.product.id, item.quantity + 1)}
              style={{ width: 36, height: 36, borderRadius: 'var(--radius-full)', border: '1px solid var(--border)' }}>
              <Plus size={16} />
            </button>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', textAlign: 'right' }}>
            {fmt(item.product.price * item.quantity)} {t("so'm", "сум")}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => cart.removeItem(item.product.id)}
            style={{ color: 'var(--error)' }}>
            <Trash size={18} />
          </button>
        </motion.div>
      ))}
    </div>
  );
}
