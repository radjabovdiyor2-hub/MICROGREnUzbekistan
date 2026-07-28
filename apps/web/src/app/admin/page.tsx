'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AdminStats } from '@/components/admin/AdminStats';
import { AdminOrders } from '@/components/admin/AdminOrders';
import { AdminProducts } from '@/components/admin/AdminProducts';
import { AdminPOS } from '@/components/admin/AdminPOS';
import { AdminInventory } from '@/components/admin/AdminInventory';
import { AdminDebts } from '@/components/admin/AdminDebts';
import { AdminMovements } from '@/components/admin/AdminMovements';
import { AdminSuppliers } from '@/components/admin/AdminSuppliers';
import { AdminEmployees } from '@/components/admin/AdminEmployees';
import { AdminAnalytics } from '@/components/admin/AdminAnalytics';
import { AdminForecast } from '@/components/admin/AdminForecast';
import { AdminNotifications } from '@/components/admin/AdminNotifications';
import { AdminSettings } from '@/components/admin/AdminSettings';
import { AdminRevenue } from '@/components/admin/AdminRevenue';
import { AdminGrowing } from '@/components/admin/AdminGrowing';
import { AdminMagazine } from '@/components/admin/AdminMagazine';
import { AdminDepartment } from '@/components/admin/AdminDepartment';
import {
  ArrowLeft, ArrowRight, BarChart, ChevronRight, ClipboardList, CreditCard, DollarSign, Eye, FileText, Fingerprint, Home, Leaf, Lightbulb, Lock, LogOut, Package, Send, Settings, ShieldCheck, ShoppingCart, Tag, TrendingUp, Truck, User, Users,
} from 'lucide-react';

const TAB_GROUPS = [
  {
    title: { ru: 'Главное', uz: 'Asosiy' },
    tabs: [
      { id: 'pos', ru: 'Продажи', uz: 'Sotish', icon: <ShoppingCart size={16} /> },
      { id: 'stats', ru: 'Сводка', uz: 'Svodka', icon: <BarChart size={16} /> },
      { id: 'revenue', ru: 'Доход', uz: 'Tushum', icon: <DollarSign size={16} /> },
      { id: 'growing', ru: 'Посадки', uz: 'Ekish', icon: <Leaf size={16} /> },
    ]
  },
  {
    title: { ru: 'Управление', uz: 'Boshqaruv' },
    tabs: [
      { id: 'inventory', ru: 'Склад', uz: 'Ombor', icon: <Package size={16} /> },
      { id: 'movements', ru: 'Движения', uz: 'Harakatlar', icon: <ClipboardList size={16} /> },
      { id: 'orders', ru: 'Заказы', uz: 'Buyurtmalar', icon: <Truck size={16} /> },
      { id: 'suppliers', ru: 'Поставщики', uz: 'Yetkazuvchilar', icon: <Truck size={16} /> },
      { id: 'debts', ru: 'Долги', uz: 'Qarzlar', icon: <CreditCard size={16} /> },
      { id: 'products', ru: 'Товары', uz: 'Mahsulotlar', icon: <Tag size={16} /> },
    ]
  },
  {
    title: { ru: 'Отделы (Telegram)', uz: "Bo'limlar (Telegram)" },
    tabs: [
      { id: 'dept_sales', ru: 'Продажи', uz: 'Sotuvlar', icon: <ShoppingCart size={16} /> },
      { id: 'dept_marketing', ru: 'Маркетинг', uz: 'Marketing', icon: <TrendingUp size={16} /> },
      { id: 'dept_content', ru: 'Контент', uz: 'Kontent', icon: <FileText size={16} /> },
      { id: 'dept_hr', ru: 'Кадры (HR)', uz: 'Kadrlar (HR)', icon: <Users size={16} /> },
      { id: 'dept_finance', ru: 'Финансы', uz: 'Moliya', icon: <DollarSign size={16} /> },
      { id: 'dept_devops', ru: 'DevOps / IT', uz: 'DevOps / IT', icon: <Settings size={16} /> },
      { id: 'dept_qa', ru: 'QA / Тесты', uz: 'QA / Testlar', icon: <Eye size={16} /> },
      { id: 'dept_rnd', ru: 'R&D', uz: 'R&D', icon: <Lightbulb size={16} /> },
      { id: 'dept_support', ru: 'Поддержка', uz: "Qo'llab", icon: <Send size={16} /> },
    ]
  },
  {
    title: { ru: 'Аналитика и Система', uz: 'Analitika va Tizim' },
    tabs: [
      { id: 'analytics', ru: 'Аналитика', uz: 'Analitika', icon: <BarChart size={16} /> },
      { id: 'forecast', ru: 'Прогноз', uz: 'Prognoz', icon: <TrendingUp size={16} /> },
      { id: 'employees', ru: 'Сотрудники', uz: 'Xodimlar', icon: <User size={16} /> },
      { id: 'magazine', ru: 'Журнал', uz: 'Jurnal', icon: <FileText size={16} /> },
      { id: 'settings', ru: 'Настройки', uz: 'Sozlamalar', icon: <Lock size={16} /> },
    ]
  }
];

const SELLER_TABS = [
  { id: 'pos', ru: 'Продажи', uz: 'Sotish', icon: <ShoppingCart size={16} /> },
];

const ADMIN_KEY = 'Microgreen_admin_auth';
const SELLER_KEY = 'Microgreen_seller';

type AuthMode = 'choose' | 'owner_login' | 'seller_login';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('pos');
  const [authMode, setAuthMode] = useState<AuthMode>('choose');
  const [isOwner, setIsOwner] = useState(false);
  const [sellerName, setSellerName] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [checking, setChecking] = useState(true);
  const [lang, setLang] = useState<'ru' | 'uz'>('ru');

  // Load saved language
  useEffect(() => {
    const saved = sessionStorage.getItem('admin_lang');
    if (saved === 'uz' || saved === 'ru') setLang(saved);
  }, []);
  const toggleLang = () => {
    const next = lang === 'ru' ? 'uz' : 'ru';
    setLang(next);
    sessionStorage.setItem('admin_lang', next);
  };
  const t = (ru: string, uz: string) => lang === 'ru' ? ru : uz;

  // Check saved auth
  useEffect(() => {
    const savedOwner = sessionStorage.getItem(ADMIN_KEY);
    const savedSeller = sessionStorage.getItem(SELLER_KEY);
    if (savedOwner === 'true') {
      setIsOwner(true);
    } else if (savedSeller) {
      setSellerName(savedSeller);
    }
    setChecking(false);
  }, []);

  const handleFaceIdLogin = async () => {
    setAuthError('');
    try {
      const optsRes = await fetch('/api/auth/webauthn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'login-options' }),
      });
      const opts = await optsRes.json();
      if (!optsRes.ok) {
        // WEBAUTHN_DISABLED — прежняя реализация не проверяла подпись и
        // пускала владельцем по одному лишь id ключа. Вход отключён до
        // переделки на @simplewebauthn/server, пароль работает как прежде.
        setAuthError(opts.error || t('Face ID не привязан', "Face ID biriktirilmagan"));
        return;
      }

      const { sessionId, publicKey } = opts;
      publicKey.challenge = Uint8Array.from(atob(publicKey.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      if (publicKey.allowCredentials) {
        publicKey.allowCredentials = publicKey.allowCredentials.map((c: any) => ({
          ...c,
          id: Uint8Array.from(atob(c.id.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0)),
        }));
      }

      const cred = await navigator.credentials.get({ publicKey }) as any;
      if (!cred) return;

      const verifyRes = await fetch('/api/auth/webauthn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login-verify',
          sessionId,
          credential: { id: cred.id },
        }),
      });
      const verifyData = await verifyRes.json();
      if (verifyData.ok) {
        setIsOwner(true);
        sessionStorage.setItem(ADMIN_KEY, 'true');
        setAuthError('');
      } else {
        setAuthError(verifyData.error || t('Ошибка Face ID', 'Face ID xatosi'));
      }
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        setAuthError(err.message || t('Ошибка биометрии', 'Biometriya xatosi'));
      }
    }
  };

  const handleFaceIdRegister = async () => {
    try {
      const optsRes = await fetch('/api/auth/webauthn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register-options' }),
      });
      const opts = await optsRes.json();
      const { sessionId, publicKey } = opts;

      publicKey.challenge = Uint8Array.from(atob(publicKey.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      publicKey.user.id = Uint8Array.from(atob(publicKey.user.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      if (publicKey.excludeCredentials) {
        publicKey.excludeCredentials = publicKey.excludeCredentials.map((c: any) => ({
          ...c,
          id: Uint8Array.from(atob(c.id.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0)),
        }));
      }

      const cred = await navigator.credentials.create({ publicKey }) as any;
      if (!cred) return;

      const verifyRes = await fetch('/api/auth/webauthn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register-verify',
          sessionId,
          credential: { id: cred.id },
          label: 'Face ID / Touch ID',
        }),
      });
      const verifyData = await verifyRes.json();
      if (verifyData.ok) {
        alert(t('Face ID успешно привязан!', "Face ID muvaffaqiyatli biriktirildi!"));
      }
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        alert(err.message || 'Face ID error');
      }
    }
  };

  const handleOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      // POST, а не GET: в query-строке пароль оседал в логах nginx,
      // в истории браузера и в Referer. Сервер в ответ ставит
      // httpOnly-cookie — пароль на клиенте больше не хранится.
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'login', password }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setIsOwner(true);
        sessionStorage.setItem(ADMIN_KEY, 'true');
        setAuthError('');
        setPassword('');
      } else if (res.status === 429) {
        setAuthError(
          t(
            `Слишком много попыток. Повторите через ${data.retryAfter ?? 900} с`,
            `Juda ko'p urinish. ${data.retryAfter ?? 900} soniyadan keyin urining`,
          ),
        );
      } else {
        setAuthError(data.error || "Parol noto'g'ri");
      }
    } catch {
      setAuthError("Server bilan bog'lanib bo'lmadi");
    }
  };

  const handleSellerLogin = async () => {
    if (pin.length !== 4) return;
    try {
      const res = await fetch('/api/inventory/employees/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.success) {
        setSellerName(data.employee.name);
        sessionStorage.setItem(SELLER_KEY, data.employee.name);
        setAuthError('');
      } else {
        setAuthError(t("Неверный PIN", "PIN noto'g'ri"));
        setPin('');
      }
    } catch {
      setAuthError(t('Ошибка', 'Xatolik yuz berdi'));
    }
  };

  const handleLogout = async () => {
    // Гасим серверную сессию, а не только флаг в браузере: иначе cookie
    // осталась бы валидной и после «выхода».
    const endpoint = isOwner ? '/api/auth/password' : '/api/inventory/employees/auth';
    try {
      await fetch(endpoint, { method: 'DELETE', credentials: 'same-origin' });
    } catch {
      // сеть недоступна — локальное состояние всё равно сбрасываем
    }
    sessionStorage.removeItem(ADMIN_KEY);
    sessionStorage.removeItem(SELLER_KEY);
    setIsOwner(false);
    setSellerName('');
    setAuthMode('choose');
    setPassword('');
    setPin('');
  };

  useEffect(() => {
    if (pin.length === 4) handleSellerLogin();
  }, [pin]);

  if (checking) return null;

  const isAuthenticated = isOwner || sellerName;

  // === AUTH SCREENS ===
  if (!isAuthenticated) {
    // Choose mode
    if (authMode === 'choose') {
      return (
        <div className="container" style={{ maxWidth: 400, paddingTop: 'var(--space-16)', textAlign: 'center' }}>
          <div style={{ marginBottom: 'var(--space-6)', color: 'var(--brand-primary)' }}>
            <Settings size={56} />
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-2)' }}>
            Microgreen
          </h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-8)' }}>{t('Кто вы?', 'Kim siz?')}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <button onClick={() => setAuthMode('owner_login')} className="card"
              style={{ padding: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-lg)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Settings size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>{t('Владелец', 'Egasi')}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t('Полное управление', "To'liq boshqaruv")}</div>
              </div>
              <ChevronRight size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
            </button>

            <button onClick={() => setAuthMode('seller_login')} className="card"
              style={{ padding: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-lg)', background: 'var(--success-bg)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Tag size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>{t('Продавец', 'Sotuvchi')}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t('Только продажи', 'Faqat sotish')}</div>
              </div>
              <ChevronRight size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
            </button>
          </div>

          <Link href="/" className="btn btn-ghost" style={{ marginTop: 'var(--space-6)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Home size={16} /> {t('На главную', 'Bosh sahifaga')}
          </Link>
        </div>
      );
    }

    // Owner login
    if (authMode === 'owner_login') {
      return (
        <div className="container" style={{ maxWidth: 400, paddingTop: 'var(--space-16)', textAlign: 'center' }}>
          <button onClick={() => { setAuthMode('choose'); setAuthError(''); }} className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={16} /> {t('Назад', 'Orqaga')}
          </button>
          <div style={{ marginBottom: 'var(--space-4)', color: 'var(--brand-primary)' }}>
            <Lock size={48} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-6)' }}>{t('Вход владельца', 'Egasi kirishi')}</h2>
          <form onSubmit={handleOwnerLogin} className="card" style={{ padding: 'var(--space-6)', textAlign: 'left' }}>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-1)' }}>{t('Пароль', 'Parol')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('Пароль администратора', 'Admin parol')} id="admin-password"
              style={{ width: '100%', padding: 'var(--space-3)', border: `1px solid ${authError ? 'var(--error)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', outline: 'none', color: 'var(--text-primary)', marginBottom: 'var(--space-3)' }} />
            {authError && <p style={{ color: 'var(--error)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)' }}>{authError}</p>}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <button type="submit" className="btn btn-primary btn-lg btn-block" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <ArrowRight size={18} /> {t('Войти по паролю', 'Parol bilan kirish')}
              </button>

              <button type="button" onClick={handleFaceIdLogin} className="btn btn-outline btn-lg btn-block" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <Fingerprint size={20} color="var(--brand-primary)" /> {t('Вход по Face ID / Touch ID', 'Face ID / Touch ID orqali kirish')}
              </button>
            </div>
          </form>
        </div>
      );
    }

    // Seller PIN login
    if (authMode === 'seller_login') {
      return (
        <div className="container" style={{ maxWidth: 360, paddingTop: 'var(--space-16)', textAlign: 'center' }}>
          <button onClick={() => { setAuthMode('choose'); setAuthError(''); setPin(''); }} className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={16} /> {t('Назад', 'Orqaga')}
          </button>
          <div style={{ marginBottom: 'var(--space-4)', color: 'var(--success)' }}>
            <Tag size={48} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-2)' }}>{t('PIN продавца', 'Sotuvchi PIN')}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>{t('Введите 4-значный PIN', '4 raqamli PIN kiriting')}</p>

          {/* PIN dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{
                width: 16, height: 16, borderRadius: 'var(--radius-full)',
                background: pin.length > i ? 'var(--brand-primary)' : 'var(--bg-tertiary)',
                border: '2px solid var(--border)',
                transition: 'all 0.15s',
              }} />
            ))}
          </div>

          {authError && <p style={{ color: 'var(--error)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>{authError}</p>}

          {/* PIN pad */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)', maxWidth: 280, margin: '0 auto' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((key, i) => {
              if (key === null) return <div key={i} />;
              if (key === 'del') {
                return (
                  <button key={i} onClick={() => setPin(p => p.slice(0, -1))} className="btn btn-ghost"
                    style={{ height: 56, fontSize: 'var(--text-lg)', borderRadius: 'var(--radius-lg)' }}>
                    <ArrowLeft size={20} />
                  </button>
                );
              }
              return (
                <button key={i} onClick={() => pin.length < 4 && setPin(p => p + key)}
                  className="btn btn-ghost"
                  style={{ height: 56, fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', borderRadius: 'var(--radius-lg)', fontFamily: 'var(--font-display)' }}>
                  {key}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
  }

  // === MAIN ADMIN PANEL ===
  return (
    <div className="admin-layout" style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <style>{`
        .admin-layout {
          display: flex;
          flex-direction: column;
          overflow-x: hidden;
          max-width: 100vw;
        }

        .admin-sidebar {
          background: var(--bg-card);
          border-bottom: 1px solid var(--border);
          padding: var(--space-3) var(--space-4);
          display: flex;
          flex-direction: column;
          z-index: 10;
        }

        .admin-main {
          flex: 1;
          padding: var(--space-4);
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
          overflow-x: hidden;
          box-sizing: border-box;
        }

        /* Header */
        .admin-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: var(--space-3); gap: var(--space-2);
        }
        .admin-header h1 {
          font-family: var(--font-display); font-weight: var(--font-extrabold);
          font-size: var(--text-lg); display: flex; align-items: center; gap: 8px;
          white-space: nowrap; color: var(--text-primary);
        }
        .admin-header-actions {
          display: flex; gap: var(--space-2); align-items: center; flex-shrink: 0;
        }

        /* Tabs: horizontal scroll on tablet, grid on mobile */
        .admin-tabs {
          display: flex; gap: var(--space-1);
          overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch;
        }
        .admin-tabs::-webkit-scrollbar { display: none; }
        .admin-tab {
          display: flex; align-items: center; gap: 6px; white-space: nowrap;
          padding: 8px 12px; border-radius: var(--radius-md);
          font-size: var(--text-sm); font-weight: var(--font-medium);
          transition: all var(--transition-fast); cursor: pointer;
          border: 1px solid transparent; background: transparent; color: var(--text-secondary);
          flex-shrink: 0;
        }
        .admin-tab.active {
          background: var(--brand-primary-light); color: var(--brand-primary);
          border-color: rgba(var(--brand-primary-rgb), 0.2);
        }
        .admin-tab:not(.active):hover { background: var(--bg-tertiary); color: var(--text-primary); }

        /* Desktop Layout (Sidebar) */
        @media (min-width: 1024px) {
          .admin-layout {
            flex-direction: row;
            height: 100vh;
            overflow: hidden;
          }
          .admin-sidebar {
            width: 260px;
            height: 100vh;
            border-bottom: none;
            border-right: 1px solid var(--border);
            padding: var(--space-6) var(--space-4);
            overflow-y: auto;
          }
          .admin-header {
            flex-direction: column;
            align-items: flex-start;
            margin-bottom: var(--space-8);
          }
          .admin-header-actions {
            margin-top: var(--space-4);
            width: 100%;
            justify-content: flex-start;
          }
          .admin-tabs {
            flex-direction: column;
            overflow: visible;
          }
          .admin-tab {
            padding: 10px 14px;
            width: 100%;
            justify-content: flex-start;
          }
          .admin-main {
            overflow-y: auto;
            padding: var(--space-8);
          }
        }

        /* Mobile Layout */
        @media (max-width: 768px) {
          .admin-header { margin-bottom: var(--space-1); }
          .admin-header h1 { font-size: var(--text-base); }
          .admin-sidebar { padding: var(--space-2) var(--space-3); }
          .admin-tabs {
            display: grid !important;
            grid-template-columns: repeat(4, 1fr);
            gap: 4px;
            margin-top: var(--space-2);
            overflow: visible;
          }
          .admin-tab {
            flex-direction: column !important;
            justify-content: center;
            align-items: center;
            padding: 8px 4px !important;
            gap: 3px !important;
            font-size: 10px !important;
            border-radius: 10px !important;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            white-space: nowrap;
            min-width: 0;
          }
          .admin-tab svg { width: 16px; height: 16px; margin: 0; flex-shrink: 0; }
          .admin-tab.active {
            background: var(--brand-primary); color: white; border-color: var(--brand-primary);
            box-shadow: 0 2px 8px rgba(var(--brand-primary-rgb), 0.3);
          }
          .admin-tab.active svg { color: white; }
          .admin-main { padding: var(--space-2); overflow-x: hidden; max-width: 100vw; }
        }
      `}</style>

      {/* Sidebar / Topbar */}
      <aside className="admin-sidebar">
        <div className="admin-header">
          <h1>
            {isOwner ? <><Settings size={24} color="var(--brand-primary)" /> Microgreen Admin</> : <><Tag size={24} color="var(--success)" /> {sellerName}</>}
          </h1>
          <div className="admin-header-actions">
            {!isOwner && (
              <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)' }}>
                {t('Продавец', 'Sotuvchi')}
              </span>
            )}
            {isOwner && <AdminNotifications />}
            {isOwner && (
              <button onClick={handleFaceIdRegister} title={t('Привязать Face ID / Touch ID', "Face ID / Touch ID biriktirish")}
                style={{ padding: '4px 8px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: 700, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Fingerprint size={14} /> Face ID
              </button>
            )}
            <button onClick={toggleLang}
              style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: 700, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
              {lang === 'ru' ? '🇷🇺' : '🇺🇿'}
            </button>
            <Link href="/" className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'center' }}>
              <Home size={14} /> {t('Сайт', 'Sayt')}
            </Link>
            <button onClick={handleLogout} className="btn btn-ghost btn-sm"
              style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239, 68, 68, 0.1)' }}>
              <LogOut size={14} /> {t('Выйти', 'Chiqish')}
            </button>
          </div>
        </div>

        <nav className="admin-tabs-container" style={{ padding: '0 var(--space-4)', overflowY: 'auto', flex: 1 }}>
          {isOwner ? (
            TAB_GROUPS.map((group, idx) => (
              <div key={idx} style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingLeft: '8px' }}>
                  {group.title[lang]}
                </div>
                <div className="admin-tabs-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {group.tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                      className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}>
                      {tab.icon} {tab[lang]}
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="admin-tabs-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {SELLER_TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}>
                  {tab.icon} {tab[lang]}
                </button>
              ))}
            </div>
          )}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        {activeTab === 'pos' && <AdminPOS sellerName={isOwner ? t('Владелец', 'Egasi') : sellerName} />}
        {activeTab === 'stats' && isOwner && <AdminStats />}
        {activeTab === 'revenue' && isOwner && <AdminRevenue />}
        {activeTab === 'growing' && isOwner && <AdminGrowing />}
        {activeTab === 'inventory' && isOwner && <AdminInventory />}
        {activeTab === 'movements' && isOwner && <AdminMovements />}
        {activeTab === 'orders' && isOwner && <AdminOrders />}
        {activeTab === 'suppliers' && isOwner && <AdminSuppliers />}
        {activeTab === 'debts' && isOwner && <AdminDebts />}
        
        {/* Department Tabs */}
        {activeTab === 'dept_sales' && isOwner && <AdminDepartment departmentId="sales" departmentName={t('Продажи', 'Sotuvlar')} botName="MicrogreenSales_bot" lang={lang} />}
        {activeTab === 'dept_marketing' && isOwner && <AdminDepartment departmentId="marketing" departmentName={t('Маркетинг', 'Marketing')} botName="MG_Marketing_bot" lang={lang} />}
        {activeTab === 'dept_content' && isOwner && <AdminDepartment departmentId="content" departmentName={t('Контент', 'Kontent')} botName="MG_Finance1_bot" lang={lang} />}
        {activeTab === 'dept_hr' && isOwner && <AdminDepartment departmentId="hr" departmentName={t('Кадры (HR)', 'Kadrlar (HR)')} botName="MG_HR1_bot" lang={lang} />}
        {activeTab === 'dept_finance' && isOwner && <AdminDepartment departmentId="finance" departmentName={t('Финансы', 'Moliya')} botName="MG_Content1_bot" lang={lang} />}
        {activeTab === 'dept_devops' && isOwner && <AdminDepartment departmentId="devops" departmentName={t('DevOps / IT', 'DevOps / IT')} botName="MG_PM1_bot" lang={lang} />}
        {activeTab === 'dept_qa' && isOwner && <AdminDepartment departmentId="qa" departmentName={t('QA / Тесты', 'QA / Testlar')} botName="MG_PM1_bot" lang={lang} />}
        {activeTab === 'dept_rnd' && isOwner && <AdminDepartment departmentId="rnd" departmentName={t('R&D', 'R&D')} botName="MG_PM1_bot" lang={lang} />}
        {activeTab === 'dept_support' && isOwner && <AdminDepartment departmentId="support" departmentName={t('Поддержка', "Qo'llab-quvvatlash")} botName="MicrogreenSupport_bot" lang={lang} />}
        
        {/* Analytics & System */}
        {activeTab === 'analytics' && isOwner && <AdminAnalytics />}
        {activeTab === 'forecast' && isOwner && <AdminForecast />}
        {activeTab === 'employees' && isOwner && <AdminEmployees />}
        {activeTab === 'magazine' && isOwner && <AdminMagazine />}
        {activeTab === 'products' && isOwner && <AdminProducts />}
        {activeTab === 'settings' && isOwner && <AdminSettings />}
      </main>
    </div>
  );
}
