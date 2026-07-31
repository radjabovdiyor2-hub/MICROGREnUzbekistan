'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/components/providers/ThemeProvider';
import { useLang } from '@/components/providers/LangProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { TelegramLoginButton } from '@/components/auth/TelegramLoginButton';
import {
  ArrowLeft, CheckCircle, ChevronRight, Instagram, MessageCircle, Moon, Percent, Phone, Settings, Share2, ShoppingCart, Star, Sun, User, Users, XCircle,
} from 'lucide-react';
import { motion } from 'framer-motion';

const spring = { type: 'spring' as const, damping: 25, stiffness: 120 };

function SimpleRegisterForm() {
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

function UserOrders() {
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

export default function ProfilePage() {
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const { user, dbUser, isLoggedIn, logout, isLoading } = useAuth();
  const [authTab, setAuthTab] = useState<'simple'|'telegram'>('simple');

  const memberSince = dbUser?.createdAt
    ? new Date(dbUser.createdAt).toLocaleDateString(lang === 'uz' ? 'uz-UZ' : 'ru-RU', { year: 'numeric', month: 'long' })
    : null;

  return (
    <div className="container" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
      <motion.h1 className="section-title" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <User size={28} /> {t('Profil', 'Профиль')}
      </motion.h1>

      {/* Profile Card */}
      <motion.div className="card glow-green" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.08 }} style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div className="skeleton" style={{ width: 72, height: 72, borderRadius: 'var(--radius-full)' }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ width: '60%', height: 20, borderRadius: 8, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '40%', height: 14, borderRadius: 6 }} />
            </div>
          </div>
        ) : isLoggedIn && user ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              {user.photo_url ? (
                <img src={user.photo_url} alt={user.first_name} style={{
                  width: 72, height: 72, borderRadius: 'var(--radius-full)',
                  objectFit: 'cover', border: '3px solid var(--brand-primary)',
                }} />
              ) : (
                <div style={{
                  width: 72, height: 72, borderRadius: 'var(--radius-full)',
                  background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '28px', color: 'white', fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)',
                }}>
                  {user.first_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xl)' }}>
                  {user.first_name} {user.last_name || ''}
                </h2>
                {user.username && <p style={{ color: 'var(--brand-primary)', fontSize: 'var(--text-sm)' }}>@{user.username}</p>}
                {memberSince && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginTop: 4 }}>{t("A'zo bo'lgan", 'Участник с')}: {memberSince}</p>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-4)', textAlign: 'center' }}>
              <div style={{ padding: 'var(--space-3)', background: 'var(--brand-primary-light)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-lg)', color: 'var(--brand-primary)' }}>{dbUser?.bonusPoints || 0}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t('Ball', 'Баллы')}</div>
              </div>
              <div style={{ padding: 'var(--space-3)', background: 'var(--brand-accent-light)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-lg)', color: 'var(--brand-accent)' }}><Star fill="currentColor" strokeWidth={1} size={18} style={{ verticalAlign: 'text-bottom' }} /></div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{dbUser?.role === 'ADMIN' ? 'Admin' : t('Mijoz', 'Клиент')}</div>
              </div>
              <div style={{ padding: 'var(--space-3)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-lg)', color: 'var(--success)' }}><CheckCircle size={18} style={{ verticalAlign: 'text-bottom' }} /></div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t('Faol', 'Активен')}</div>
              </div>
            </div>
            <ReferralSection userId={dbUser?.id} referralCode={dbUser?.referralCode} bonusPoints={dbUser?.bonusPoints || 0} lang={lang} t={t} />
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              <div style={{
                width: 72, height: 72, borderRadius: 'var(--radius-full)',
                background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white',
              }}><User size={32} /></div>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xl)' }}>{t('Xush kelibsiz', 'Добро пожаловать')}</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>{t("Ro'yxatdan o'ting yoki Telegram orqali kiring", 'Зарегистрируйтесь или войдите через Telegram')}</p>
              </div>
            </div>

            {/* Auth tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-3)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 3 }}>
              <button onClick={() => setAuthTab('simple')} style={{
                flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 700,
                background: authTab === 'simple' ? 'var(--bg-card)' : 'transparent',
                color: authTab === 'simple' ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: authTab === 'simple' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s',
              }}>{t('Telefon orqali', 'По телефону')}</button>
              <button onClick={() => setAuthTab('telegram')} style={{
                flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 700,
                background: authTab === 'telegram' ? 'var(--bg-card)' : 'transparent',
                color: authTab === 'telegram' ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: authTab === 'telegram' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s',
              }}>Telegram</button>
            </div>

            {authTab === 'simple' ? (
              <SimpleRegisterForm />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) 0' }}>
                <TelegramLoginButton botName="Microgreenuzbekistan_bot" />
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textAlign: 'center' }}>
                  {t("Telegram orqali xavfsiz kirish", "Безопасный вход через Telegram")}
                </p>
              </div>
            )}
          </>
        )}
      </motion.div>

      {/* Orders */}
      {isLoggedIn && <UserOrders />}

      {/* Settings */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={18} /> {t('Sozlamalar', 'Настройки')}
          </h3>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          style={{
            width: '100%', padding: 'var(--space-4)', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', borderBottom: '1px solid var(--border)',
            background: 'transparent', cursor: 'pointer', color: 'var(--text-primary)',
            border: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
          }}
          id="profile-theme-toggle"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span>{theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}</span>
            <span>{t('Mavzu', 'Тема')}</span>
          </span>
          <span style={{
            padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-full)',
            background: 'var(--bg-tertiary)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)',
          }}>
            {theme === 'light' ? t("Yorug'", 'Светлая') : t("Qorong'u", 'Тёмная')}
          </span>
        </button>

        {/* Language Toggle */}
        <button
          onClick={() => setLang(lang === 'uz' ? 'ru' : 'uz')}
          style={{
            width: '100%', padding: 'var(--space-4)', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', borderBottom: '1px solid var(--border)',
            background: 'transparent', cursor: 'pointer', color: 'var(--text-primary)',
            border: 'none',
          }}
          id="profile-lang-toggle"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <MessageCircle size={18} />
            <span>{t('Til', 'Язык')}</span>
          </span>
          <span style={{
            padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-full)',
            background: lang === 'uz' ? 'var(--brand-primary-light)' : 'var(--brand-accent-light)',
            color: lang === 'uz' ? 'var(--brand-primary)' : 'var(--brand-accent)',
            fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)',
            transition: 'all var(--transition-fast)',
          }}>
            {lang === 'uz' ? "O'zbekcha" : 'Русский'}
          </span>
        </button>

        {/* Support */}
        <a href="tel:+998949999599" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'var(--space-4)', borderBottom: isLoggedIn ? '1px solid var(--border)' : 'none',
          color: 'var(--text-primary)', textDecoration: 'none',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Phone size={18} />
            <span>{t('Aloqa', 'Контакты')}: +998 94 999 95 99</span>
          </span>
          <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
        </a>

        {/* Logout */}
        {isLoggedIn && (
          <button
            onClick={logout}
            style={{
              width: '100%', padding: 'var(--space-4)', display: 'flex', alignItems: 'center',
              gap: 'var(--space-3)', background: 'transparent', cursor: 'pointer',
              color: 'var(--error)', border: 'none',
            }}
            id="logout-btn"
          >
            <ArrowLeft size={18} />
            <span>{t('Chiqish', 'Выйти')}</span>
          </button>
        )}
      </div>

      {/* Social Links */}
      <div style={{
        display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)', justifyContent: 'center',
        flexWrap: 'wrap',
      }}>
        <a href="https://www.instagram.com/microgreenuzbekistan" target="_blank" rel="noopener noreferrer"
          className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Instagram size={16} /> Instagram
        </a>
        <a href="https://t.me/Microgreenuzbekistan_bot" target="_blank" rel="noopener noreferrer"
          className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MessageCircle size={16} /> Telegram Bot
        </a>
        <a href="https://t.me/Microgreen_Uzbekistan" target="_blank" rel="noopener noreferrer"
          className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MessageCircle size={16} /> {t('Kanal', 'Канал')}
        </a>
      </div>

      <div style={{ textAlign: 'center', marginTop: 'var(--space-8)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
        Microgreen v1.0.0 · © 2026
      </div>
    </div>
  );
}

// ==========================================
// Referral Section Component
// ==========================================


/** Реферальная статистика пользователя — из GET /api/referral. */
interface ReferralData {
  referralCode?: string;
  referralCount?: number;
  referredBy?: string | null;
}

function ReferralSection({ userId, referralCode, bonusPoints, lang, t }: {
  userId?: string;
  referralCode?: string;
  bonusPoints: number;
  lang: string;
  t: (uz: string, ru: string) => string;
}) {
  const [copied, setCopied] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [applyStatus, setApplyStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [applying, setApplying] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load referral data
  const loadData = async () => {
    if (!userId || loaded) return;
    try {
      const res = await fetch(`/api/referral?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setReferralData(data);
      }
    } catch { /* ignore */ }
    setLoaded(true);
  };

  // Load on first render (properly via useEffect)
  useEffect(() => {
    loadData();
    // loadData пересоздаётся каждый рендер и сама завязана на loaded —
    // в зависимостях она даёт бесконечный цикл. Условие входа внутри неё.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, loaded]);

  const shortCode = referralData?.referralCode || (referralCode ? `AGRO-${referralCode.slice(-6).toUpperCase()}` : '...');
  const shareUrl = `https://microgreenuzbekistan.com/?ref=${referralCode || ''}`;
  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  const copyCode = async () => {
    const textUz = `Microgreen do'konidan xarid qiling va bonus oling!\n\nMening taklif kodim: ${shortCode}\n${shareUrl}\n\nBirinchi xaridda 2 000 so'm bonus!`;
    const textRu = `Покупайте в магазине Microgreen и получайте бонусы!\n\nМой код приглашения: ${shortCode}\n${shareUrl}\n\nБонус 2 000 сум на первый заказ!`;
    const text = lang === 'uz' ? textUz : textRu;
    try {
      if (navigator.share) {
        await navigator.share({ text, title: 'Microgreen — Taklif kodi' });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      await navigator.clipboard.writeText(shortCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const applyCode = async () => {
    if (!inputCode.trim() || !userId || applying) return;
    setApplying(true);
    setApplyStatus(null);
    try {
      const res = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, referralCode: inputCode.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setApplyStatus({ ok: true, msg: data.message });
        setInputCode('');
        setLoaded(false); // reload data
      } else {
        setApplyStatus({ ok: false, msg: data.error });
      }
    } catch {
      setApplyStatus({ ok: false, msg: 'Xatolik yuz berdi' });
    }
    setApplying(false);
  };

  return (
    <div style={{ marginTop: 'var(--space-5)' }}>
      {/* Bonus Balance Card */}
      <div style={{
        background: 'linear-gradient(135deg, var(--cat-1), var(--cat-2), var(--cat-9))',
        borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)',
        color: 'white', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ position: 'absolute', bottom: -30, left: -30, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />

        <div style={{ fontSize: 'var(--text-xs)', opacity: 0.8, marginBottom: 4 }}>
          {t('Bonus balansi', 'Бонусный баланс')}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: '28px', letterSpacing: '-0.5px' }}>
          {fmt(bonusPoints)} <span style={{ fontSize: '14px', fontWeight: 400, opacity: 0.8 }}>so&apos;m</span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 'var(--radius-md)', padding: '6px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Users size={12} /> {referralData?.referralCount || 0} {t('taklif', 'приглашений')}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 'var(--radius-md)', padding: '6px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Percent size={12} /> 3% {t("har xariddan", "с каждой покупки")}
          </div>
        </div>
      </div>

      {/* Referral Code */}
      <div style={{
        marginTop: 'var(--space-3)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 2 }}>
            {t('Sizning taklif kodingiz', 'Ваш код приглашения')}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)', letterSpacing: '1px', color: 'var(--brand-primary)' }}>
            {shortCode}
          </div>
        </div>
        <button onClick={copyCode} className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {copied ? <CheckCircle size={14} /> : <Share2 size={14} />} {copied ? t('Nusxalandi', 'Скопировано') : t('Ulashish', 'Поделиться')}
        </button>
      </div>

      {/* Enter referral code (if not already referred) */}
      {!referralData?.referredBy && (
        <div style={{ marginTop: 'var(--space-3)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
            {t("Fermer kodini kiriting va 2 000 so'm bonus oling!", "Введите промокод и получите 2 000 сум бонус!")}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              type="text"
              placeholder="AGRO-XXXXXX"
              value={inputCode}
              onChange={e => setInputCode(e.target.value.toUpperCase())}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--text-primary)', fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-display)', letterSpacing: '1px',
              }}
            />
            <button onClick={applyCode} disabled={applying || !inputCode.trim()} className="btn btn-primary btn-sm" style={{ opacity: applying ? 0.5 : 1 }}>
              {applying ? '...' : t('Tasdiqlash', 'Применить')}
            </button>
          </div>
          {applyStatus && (
            <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: applyStatus.ok ? 'var(--success)' : 'var(--error)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {applyStatus.ok ? <CheckCircle size={12} /> : <XCircle size={12} />} {applyStatus.msg}
            </div>
          )}
        </div>
      )}

      {/* Rules Toggle */}
      <button
        onClick={() => setShowRules(!showRules)}
        style={{
          marginTop: 'var(--space-3)', width: '100%', background: 'none', border: 'none',
          color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: 'var(--space-2)',
        }}
      >
        <ChevronRight size={12} style={{ transform: showRules ? 'rotate(270deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }} /> {t("Bonus qoidalari", "Правила бонусов")}
      </button>

      {showRules && (
        <div style={{
          background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 'var(--font-bold)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
            {t('Qanday ishlaydi?', 'Как это работает?')}
          </div>
          <div>
            {t(
              "1. O'z kodingizni do'stlarga va fermerlarga ulashing\n2. Ular ro'yxatdan o'tganda — siz 5 000 so'm bonus olasiz\n3. Ular xarid qilganda — har bir xariddan 3% bonus olasiz\n4. Yangi foydalanuvchi ham 2 000 so'm bonus oladi\n5. Bonuslarni keyingi xaridlarda ishlating (50 000+ so'mdan)",
              "1. Поделитесь кодом с мастерами и друзьями\n2. Они регистрируются — вы получаете 5 000 сум бонус\n3. Они покупают — вы получаете 3% от каждой покупки\n4. Новый пользователь тоже получит 2 000 сум бонус\n5. Бонусы можно потратить на покупки (от 50 000 сум)"
            ).split('\n').map((line, i) => (
              <div key={i} style={{ marginBottom: 4 }}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
