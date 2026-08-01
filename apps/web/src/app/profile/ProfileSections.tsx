'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, User } from 'lucide-react';

const spring = { type: 'spring' as const, damping: 25, stiffness: 120 };
import { useAuth } from '@/components/providers/AuthProvider';
import { useLang } from '@/components/providers/LangProvider';

// Блоки личного кабинета: форма быстрой регистрации и список заказов.
// Вынесены из profile/page.tsx — самостоятельные компоненты, которые жили
// в одном файле со страницей просто потому, что там были объявлены.


export function SimpleRegisterForm() {
  const { simpleLogin } = useAuth();
  const { t } = useLang();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+998 ');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, '');
    if (d.length <= 3) return '+' + d;
    if (d.length <= 5) return '+' + d.slice(0,3) + ' ' + d.slice(3);
    if (d.length <= 8) return '+' + d.slice(0,3) + ' ' + d.slice(3,5) + ' ' + d.slice(5);
    if (d.length <= 10) return '+' + d.slice(0,3) + ' ' + d.slice(3,5) + ' ' + d.slice(5,8) + ' ' + d.slice(8);
    return '+' + d.slice(0,3) + ' ' + d.slice(3,5) + ' ' + d.slice(5,8) + ' ' + d.slice(8,10) + ' ' + d.slice(10,12);
  };

  const submit = async () => {
    if (!name.trim()) { setErr(t('Ismingizni kiriting', 'Введите имя')); return; }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 12) { setErr(t('Telefon raqamni kiriting', 'Введите номер телефона')); return; }
    setLoading(true); setErr('');
    await simpleLogin(name.trim(), phone.trim());
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)', background: 'var(--bg-primary)',
    color: 'var(--text-primary)', fontSize: 'var(--text-sm)', outline: 'none',
    transition: 'border-color 0.2s',
  };

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>
          {t('Ism Familiya', 'Имя Фамилия')}
        </label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder={t('Masalan: Ali Karimov', 'Например: Али Каримов')}
          style={inputStyle} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>
          {t('Telefon raqam', 'Номер телефона')}
        </label>
        <input type="tel" value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
          placeholder="+998 90 123 45 67" style={inputStyle} />
      </div>
      {err && <p style={{ color: 'var(--error)', fontSize: 'var(--text-xs)', marginBottom: 8 }}>{err}</p>}
      <button onClick={submit} disabled={loading} className="btn btn-primary" style={{
        width: '100%', padding: '12px', fontWeight: 700, opacity: loading ? 0.6 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <User size={16} /> {loading ? '...' : t("Ro'yxatdan o'tish", 'Зарегистрироваться')}
      </button>
    </div>
  );
}

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
      setLoading(false);
      return;
    }
    fetch(`/api/orders?userId=${encodeURIComponent(dbUser.id)}&limit=10`)
      .then(r => r.json())
      .then(d => {
        setOrders(d.orders || []);
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
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
