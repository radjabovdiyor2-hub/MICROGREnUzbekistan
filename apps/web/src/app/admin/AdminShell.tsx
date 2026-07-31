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
import { AdminGuestPhotos } from '@/components/admin/AdminGuestPhotos';
import { AdminRecipes } from '@/components/admin/AdminRecipes';
import { AdminDepartment } from '@/components/admin/AdminDepartment';
import { AdminLearnings } from '@/components/admin/AdminLearnings';
import { AdminCustomers } from '@/components/admin/AdminCustomers';
import { AdminBotControl } from '@/components/admin/AdminBotControl';
import { AdminStepan } from '@/components/admin/AdminStepan';
import { AdminBotHealth } from '@/components/admin/AdminBotHealth';
import { AdminPromo } from '@/components/admin/AdminPromo';
import { AdminFinance } from '@/components/admin/AdminFinance';
import { AdminAudit } from '@/components/admin/AdminAudit';
import { AdminAiSpend } from '@/components/admin/AdminAiSpend';
import { AdminTasks } from '@/components/admin/AdminTasks';
import { AdminCategories } from '@/components/admin/AdminCategories';
import {
  Activity, ArrowLeft, ArrowRight, BarChart, Brain, Camera, ChevronRight, ClipboardList, Command, Cpu, CreditCard, DollarSign, Eye, FileText, History, Home, Layers, Leaf, Lightbulb, Lock, LogOut, Package, Percent, Play, Search, Send, Settings, ShoppingCart, Tag, TrendingUp, Truck, User, Users, Wallet,
} from 'lucide-react';

import { TAB_GROUPS, ALL_TABS, SELLER_TABS } from './adminTabs';
import { AdminAuthScreens, type AuthMode } from './AdminAuthScreens';

interface AdminShellProps {
  /** Роль из подписанной cookie, проверенной на сервере. null — не вошёл. */
  initialRole: 'ADMIN' | 'SELLER' | null;
  initialName: string;
}

export function AdminShell({ initialRole, initialName }: AdminShellProps) {
  const [activeTab, setActiveTab] = useState('pos');
  const [authMode, setAuthMode] = useState<AuthMode>('choose');
  // Источник правды — серверная сессия. sessionStorage больше не решает,
  // кто вы: подделка ключа в браузере не даёт ни доступа, ни оболочки.
  const [isOwner, setIsOwner] = useState(initialRole === 'ADMIN');
  const [sellerName, setSellerName] = useState(initialRole === 'SELLER' ? initialName : '');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [lang, setLang] = useState<'ru' | 'uz'>(() => {
    if (typeof window === 'undefined') return 'ru';
    const saved = sessionStorage.getItem('admin_lang');
    return saved === 'uz' || saved === 'ru' ? saved : 'ru';
  });

  // Палитра команд: вкладок стало больше тридцати, и листать боковое меню
  // ради одной — дольше, чем набрать пару букв.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const toggleLang = () => {
    const next = lang === 'ru' ? 'uz' : 'ru';
    setLang(next);
    sessionStorage.setItem('admin_lang', next);
  };
  const t = (ru: string, uz: string) => lang === 'ru' ? ru : uz;

  // Сессия уже проверена на сервере (см. admin/page.tsx) — читать её из
  // браузера незачем, поэтому и экрана ожидания «checking» больше нет.

  // Cmd+K / Ctrl+K открывает палитру, Esc закрывает.
  useEffect(() => {
    if (!isOwner) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(open => !open);
        setPaletteQuery('');
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOwner]);

  const paletteResults = paletteOpen
    ? ALL_TABS.filter(tab => {
        const q = paletteQuery.trim().toLowerCase();
        if (!q) return true;
        return tab.ru.toLowerCase().includes(q)
          || tab.uz.toLowerCase().includes(q)
          || tab.id.includes(q);
      }).slice(0, 12)
    : [];

  const openTab = (id: string) => {
    setActiveTab(id);
    setPaletteOpen(false);
    setPaletteQuery('');
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

  const handleSellerLogin = async (pinValue?: string) => {
    const p = pinValue ?? pin;
    if (p.length !== 4) return;
    try {
      const res = await fetch('/api/inventory/employees/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: p }),
      });
      const data = await res.json();
      if (data.success) {
        setSellerName(data.employee.name);
        setAuthError('');
      } else {
        setAuthError(t("Неверный PIN", "PIN noto'g'ri"));
        setPin('');
      }
    } catch {
      setAuthError(t('Ошибка', 'Xatolik yuz berdi'));
    }
  };

  const handlePinPress = (digit: number) => {
    if (pin.length >= 4) return;
    const nextPin = pin + String(digit);
    setPin(nextPin);
    if (nextPin.length === 4) {
      handleSellerLogin(nextPin);
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
    setIsOwner(false);
    setSellerName('');
    setAuthMode('choose');
    setPassword('');
    setPin('');
  };

  const isAuthenticated = isOwner || sellerName;

  // === AUTH SCREENS ===
  if (!isAuthenticated) {
    return (
      <AdminAuthScreens
        authMode={authMode}
        setAuthMode={setAuthMode}
        password={password}
        setPassword={setPassword}
        pin={pin}
        setPin={setPin}
        authError={authError}
        setAuthError={setAuthError}
        handleOwnerLogin={handleOwnerLogin}
        handlePinPress={handlePinPress}
        t={t}
      />
    );
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
              // Кнопка Face ID убрана: вход по WebAuthn отключён на сервере
              // (прежняя реализация не проверяла подпись), поэтому привязка
              // ключа ничего не давала. Вместо неё — палитра команд.
              <button onClick={() => { setPaletteOpen(true); setPaletteQuery(''); }}
                title={t('Поиск по разделам (Ctrl+K)', "Bo'limlar bo'yicha qidiruv (Ctrl+K)")}
                style={{ padding: '4px 8px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: 700, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Command size={14} /> K
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
        {activeTab === 'stepan' && isOwner && <AdminStepan lang={lang} />}
        {activeTab === 'stats' && isOwner && <AdminStats />}
        {activeTab === 'revenue' && isOwner && <AdminRevenue />}
        {activeTab === 'growing' && isOwner && <AdminGrowing />}
        {activeTab === 'customers' && isOwner && <AdminCustomers lang={lang} />}
        {activeTab === 'inventory' && isOwner && <AdminInventory />}
        {activeTab === 'movements' && isOwner && <AdminMovements />}
        {activeTab === 'orders' && isOwner && <AdminOrders />}
        {activeTab === 'suppliers' && isOwner && <AdminSuppliers />}
        {activeTab === 'debts' && isOwner && <AdminDebts />}
        {activeTab === 'products' && isOwner && <AdminProducts />}
        {activeTab === 'categories' && isOwner && <AdminCategories lang={lang} />}
        {activeTab === 'promo' && isOwner && <AdminPromo lang={lang} />}
        {activeTab === 'finance' && isOwner && <AdminFinance lang={lang} />}
        {activeTab === 'employees' && isOwner && <AdminEmployees />}

        {/* ИИ-офис */}
        {activeTab === 'bot_control' && isOwner && <AdminBotControl lang={lang} />}
        {activeTab === 'bot_health' && isOwner && <AdminBotHealth lang={lang} />}
        {activeTab === 'tasks' && isOwner && <AdminTasks lang={lang} />}
        {activeTab === 'learnings' && isOwner && <AdminLearnings lang={lang} />}
        {activeTab === 'ai_spend' && isOwner && <AdminAiSpend lang={lang} />}

        {/* Отделы. Юзернеймы ботов раньше были перепутаны: контент вёл на
            MG_Finance1_bot, а финансы — на MG_Content1_bot. Служебные
            QA/R&D/DevOps Telegram-интерфейса не имеют, их ведёт Стёпан. */}
        {activeTab === 'dept_sales' && isOwner && <AdminDepartment departmentId="sales" departmentName={t('Продажи', 'Sotuvlar')} botName="MicrogreenSales_bot" lang={lang} />}
        {activeTab === 'dept_marketing' && isOwner && <AdminDepartment departmentId="marketing" departmentName={t('Маркетинг', 'Marketing')} botName="MG_Marketing_bot" lang={lang} />}
        {activeTab === 'dept_content' && isOwner && <AdminDepartment departmentId="content" departmentName={t('Контент', 'Kontent')} botName="MG_Content1_bot" lang={lang} />}
        {activeTab === 'dept_hr' && isOwner && <AdminDepartment departmentId="hr" departmentName={t('Кадры (HR)', 'Kadrlar (HR)')} botName="MG_HR1_bot" lang={lang} />}
        {activeTab === 'dept_finance' && isOwner && <AdminDepartment departmentId="finance" departmentName={t('Финансы', 'Moliya')} botName="MG_Finance1_bot" lang={lang} />}
        {activeTab === 'dept_devops' && isOwner && <AdminDepartment departmentId="devops" departmentName={t('DevOps / IT', 'DevOps / IT')} botName="MG_PM1_bot" lang={lang} />}
        {activeTab === 'dept_qa' && isOwner && <AdminDepartment departmentId="qa" departmentName={t('QA / Тесты', 'QA / Testlar')} botName="MG_PM1_bot" lang={lang} />}
        {activeTab === 'dept_rnd' && isOwner && <AdminDepartment departmentId="rnd" departmentName={t('R&D', 'R&D')} botName="MG_PM1_bot" lang={lang} />}
        {activeTab === 'dept_support' && isOwner && <AdminDepartment departmentId="support" departmentName={t('Поддержка', "Qo'llab-quvvatlash")} botName="MicrogreenSupport_bot" lang={lang} />}

        {/* Контент и журнал */}
        {activeTab === 'magazine' && isOwner && <AdminMagazine />}
        {activeTab === 'guest_photos' && isOwner && <AdminGuestPhotos />}
        {activeTab === 'recipes' && isOwner && <AdminRecipes />}

        {/* Аналитика и система */}
        {activeTab === 'analytics' && isOwner && <AdminAnalytics />}
        {activeTab === 'forecast' && isOwner && <AdminForecast />}
        {activeTab === 'audit' && isOwner && <AdminAudit lang={lang} />}
        {activeTab === 'settings' && isOwner && <AdminSettings lang={lang} />}
      </main>

      {/* Палитра команд */}
      {paletteOpen && isOwner && (
        <div
          onClick={() => setPaletteOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: '12vh', backdropFilter: 'blur(2px)',
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(560px, 92vw)', background: 'var(--bg-primary)',
              border: '1px solid var(--border)', borderRadius: 16,
              boxShadow: '0 20px 60px rgba(0,0,0,0.35)', overflow: 'hidden',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <Search size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                autoFocus
                value={paletteQuery}
                onChange={e => setPaletteQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && paletteResults[0]) openTab(paletteResults[0].id);
                }}
                placeholder={t('Куда перейти?', 'Qayerga o\'tish?')}
                style={{
                  flex: 1, border: 'none', outline: 'none', background: 'transparent',
                  color: 'var(--text-primary)', fontSize: 'var(--text-base)',
                }}
              />
            </div>

            <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: 6 }}>
              {paletteResults.map((tab, i) => (
                <button
                  key={tab.id}
                  onClick={() => openTab(tab.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: i === 0 ? 'var(--bg-secondary)' : 'transparent',
                    color: 'var(--text-primary)', textAlign: 'left', fontSize: 'var(--text-sm)',
                  }}>
                  <span style={{ color: 'var(--brand-primary)', display: 'flex' }}>{tab.icon}</span>
                  <span style={{ flex: 1 }}>{tab[lang]}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tab.group[lang]}</span>
                </button>
              ))}

              {!paletteResults.length && (
                <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                  {t('Ничего не найдено', 'Hech narsa topilmadi')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
