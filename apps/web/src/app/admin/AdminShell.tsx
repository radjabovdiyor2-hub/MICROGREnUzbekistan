'use client';

import { AdminSidebar } from './AdminSidebar';

import { AdminCommandPalette } from './AdminCommandPalette';

import { useState, useEffect } from 'react';
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

import { ALL_TABS } from './adminTabs';
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

      <AdminSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOwner={isOwner}
        sellerName={sellerName}
        lang={lang}
        toggleLang={toggleLang}
        handleLogout={handleLogout}
        setPaletteOpen={setPaletteOpen}
        setPaletteQuery={setPaletteQuery}
        t={t}
      />
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

      <AdminCommandPalette
        paletteOpen={paletteOpen}
        setPaletteOpen={setPaletteOpen}
        paletteQuery={paletteQuery}
        setPaletteQuery={setPaletteQuery}
        paletteResults={paletteResults}
        openTab={openTab}
        isOwner={isOwner}
        lang={lang}
        t={t}
      />
    </div>
  );
}
