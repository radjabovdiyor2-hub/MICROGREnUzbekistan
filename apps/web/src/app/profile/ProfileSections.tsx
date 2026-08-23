'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart } from 'lucide-react';

const spring = { type: 'spring' as const, damping: 25, stiffness: 120 };
import { useAuth } from '@/components/providers/AuthProvider';
import { useLang } from '@/components/providers/LangProvider';
/** Заказ в списке личного кабинета — из GET /api/orders. */
interface ProfileOrder {
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
  items?: { quantity: number; product?: { nameRu?: string } }[];
}

export function UserOrders() {
  const { dbUser } = useAuth();
  const { t } = useLang();
  const [orders, setOrders] = useState<ProfileOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbUser?.id) {
      Promise.resolve().then(() => setLoading(false));
      return;
    }
    Promise.resolve().then(() => {
      // Без userId в адресе: чьи это заказы, сервер знает из cookie сессии.
      fetch('/api/orders?limit=10')
        .then(r => r.json())
        .then(d => {
          setOrders(d.orders || []);
        })
        .catch(e => console.error(e))
        .finally(() => setLoading(false));
    });
  }, [dbUser?.id]);

  if (!dbUser?.id) return null;

  return (
    <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.15 }} style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
      <h3 style={{ fontWeight: 700, fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ShoppingCart size={18} /> {t("Mening buyurtmalarim", "Мои заказы")}
      </h3>
      
      {loading ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
          {t("Yuklanmoqda...", "Загрузка...")}
        </div>
      ) : orders.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', background: 'var(--bg-secondary)', borderRadius: '12px' }}>
          {t("Sizda hali buyurtmalar yo'q", "У вас пока нет заказов")}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {orders.map(o => (
            <div key={o.orderNumber} style={{ padding: '14px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '14px' }}>#{o.orderNumber}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {new Date(o.createdAt).toLocaleDateString('ru-RU')}
                  </div>
                </div>
                <span style={{ 
                  fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px',
                  background: o.status === 'PENDING' ? 'var(--warning-bg)' : o.status === 'DELIVERING' ? 'var(--info-bg)' : o.status === 'DELIVERED' ? 'var(--brand-primary-light)' : 'var(--error-bg)',
                  color: o.status === 'PENDING' ? 'var(--warning)' : o.status === 'DELIVERING' ? 'var(--info)' : o.status === 'DELIVERED' ? 'var(--brand-primary-hover)' : 'var(--error)'
                }}>
                  {o.status === 'PENDING' ? t('Kutilyapti', 'В ожидании') : 
                   o.status === 'DELIVERING' ? t('Yetkazilyapti', 'В пути') : 
                   o.status === 'DELIVERED' ? t('Yetkazildi', 'Доставлен') : t('Bekor qilingan', 'Отменён')}
                </span>
              </div>
              
              {/* Items preview */}
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {o.items?.map((i) => `${i.quantity}x ${i.product?.nameRu || 'Товар'}`).join(', ')}
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t("Jami", "Сумма")}:</span>
                <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-primary)' }}>{o.total.toLocaleString('ru-RU')} sum</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
