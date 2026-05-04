'use client';

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
import { AdminNotifications } from '@/components/admin/AdminNotifications';
import { AdminSettings } from '@/components/admin/AdminSettings';
import { AdminRevenue } from '@/components/admin/AdminRevenue';
import * as Icons from '@/components/ui/Icons';

const OWNER_TABS = [
  { id: 'pos', label: 'Sotish', icon: <Icons.ShoppingCart size={16} /> },
  { id: 'stats', label: 'Svodka', icon: <Icons.BarChart size={16} /> },
  { id: 'revenue', label: 'Tushum', icon: <Icons.DollarSign size={16} /> },
  { id: 'inventory', label: 'Ombor', icon: <Icons.Package size={16} /> },
  { id: 'movements', label: 'Harakatlar', icon: <Icons.ClipboardList size={16} /> },
  { id: 'orders', label: 'Buyurtmalar', icon: <Icons.Truck size={16} /> },
  { id: 'suppliers', label: 'Yetkazuvchilar', icon: <Icons.Truck size={16} /> },
  { id: 'debts', label: 'Qarzlar', icon: <Icons.CreditCard size={16} /> },
  { id: 'analytics', label: 'Analitika', icon: <Icons.BarChart size={16} /> },
  { id: 'forecast', label: 'Prognoz', icon: <Icons.TrendingUp size={16} /> },
  { id: 'employees', label: 'Xodimlar', icon: <Icons.User size={16} /> },
  { id: 'products', label: 'Mahsulotlar', icon: <Icons.Tag size={16} /> },
  { id: 'settings', label: 'Sozlamalar', icon: <Icons.Lock size={16} /> },
];

const SELLER_TABS = [
  { id: 'pos', label: 'Sotish', icon: <Icons.ShoppingCart size={16} /> },
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

  const handleOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`/api/auth/password?password=${encodeURIComponent(password)}`);
      const data = await res.json();
      if (data.valid) {
        setIsOwner(true);
        sessionStorage.setItem(ADMIN_KEY, 'true');
        setAuthError('');
      } else {
        setAuthError("Parol noto'g'ri");
      }
    } catch {
      // Fallback to hardcoded password if API fails
      if (password === 'Microgreen2026') {
        setIsOwner(true);
        sessionStorage.setItem(ADMIN_KEY, 'true');
        setAuthError('');
      } else {
        setAuthError("Parol noto'g'ri");
      }
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
        setAuthError("PIN noto'g'ri");
        setPin('');
      }
    } catch {
      setAuthError('Xatolik yuz berdi');
    }
  };

  const handleLogout = () => {
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
  const tabs = isOwner ? OWNER_TABS : SELLER_TABS;

  // === AUTH SCREENS ===
  if (!isAuthenticated) {
    // Choose mode
    if (authMode === 'choose') {
      return (
        <div className="container" style={{ maxWidth: 400, paddingTop: 'var(--space-16)', textAlign: 'center' }}>
          <div style={{ marginBottom: 'var(--space-6)', color: 'var(--brand-primary)' }}>
            <Icons.Settings size={56} />
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-2)' }}>
            Microgreen
          </h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-8)' }}>Kim siz?</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <button onClick={() => setAuthMode('owner_login')} className="card"
              style={{ padding: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-lg)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icons.Settings size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>Egasi</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>To&apos;liq boshqaruv</div>
              </div>
              <Icons.ChevronRight size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
            </button>

            <button onClick={() => setAuthMode('seller_login')} className="card"
              style={{ padding: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-lg)', background: 'var(--success-bg)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icons.Tag size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>Sotuvchi</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Faqat sotish</div>
              </div>
              <Icons.ChevronRight size={20} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
            </button>
          </div>

          <a href="/" className="btn btn-ghost" style={{ marginTop: 'var(--space-6)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Icons.Home size={16} /> Bosh sahifaga
          </a>
        </div>
      );
    }

    // Owner login
    if (authMode === 'owner_login') {
      return (
        <div className="container" style={{ maxWidth: 400, paddingTop: 'var(--space-16)', textAlign: 'center' }}>
          <button onClick={() => { setAuthMode('choose'); setAuthError(''); }} className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Icons.ArrowLeft size={16} /> Orqaga
          </button>
          <div style={{ marginBottom: 'var(--space-4)', color: 'var(--brand-primary)' }}>
            <Icons.Lock size={48} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-6)' }}>Egasi kirishi</h2>
          <form onSubmit={handleOwnerLogin} className="card" style={{ padding: 'var(--space-6)', textAlign: 'left' }}>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-1)' }}>Parol</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Admin parol" id="admin-password"
              style={{ width: '100%', padding: 'var(--space-3)', border: `1px solid ${authError ? 'var(--error)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', outline: 'none', color: 'var(--text-primary)', marginBottom: 'var(--space-3)' }} />
            {authError && <p style={{ color: 'var(--error)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)' }}>{authError}</p>}
            <button type="submit" className="btn btn-primary btn-lg btn-block" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              <Icons.ArrowRight size={18} /> Kirish
            </button>
          </form>
        </div>
      );
    }

    // Seller PIN login
    if (authMode === 'seller_login') {
      return (
        <div className="container" style={{ maxWidth: 360, paddingTop: 'var(--space-16)', textAlign: 'center' }}>
          <button onClick={() => { setAuthMode('choose'); setAuthError(''); setPin(''); }} className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Icons.ArrowLeft size={16} /> Orqaga
          </button>
          <div style={{ marginBottom: 'var(--space-4)', color: 'var(--success)' }}>
            <Icons.Tag size={48} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-2)' }}>Sotuvchi PIN</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>4 raqamli PIN kiriting</p>

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
                    <Icons.ArrowLeft size={20} />
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
          .admin-header { margin-bottom: var(--space-2); }
          .admin-header h1 { font-size: var(--text-base); }
          .admin-sidebar { padding: var(--space-2) var(--space-3); }
          .admin-tabs {
            display: flex; flex-direction: row; flex-wrap: nowrap;
            gap: var(--space-2); margin-top: var(--space-2);
            overflow-x: auto; padding-bottom: 8px;
          }
          .admin-tab {
            justify-content: center; padding: 8px 12px; flex-direction: row; gap: 6px;
            font-size: 13px; border-radius: var(--radius-full);
            background: var(--bg-secondary); border: 1px solid var(--border);
            white-space: nowrap; flex-shrink: 0;
          }
          .admin-tab.active {
            background: var(--brand-primary); color: var(--text-inverse); border-color: var(--brand-primary);
          }
          .admin-tab.active svg { color: var(--text-inverse); }
          .admin-tab svg { margin: 0; }
          .admin-main { padding: var(--space-2); overflow-x: hidden; max-width: 100vw; }
        }
      `}</style>

      {/* Sidebar / Topbar */}
      <aside className="admin-sidebar">
        <div className="admin-header">
          <h1>
            {isOwner ? <><Icons.Settings size={24} color="var(--brand-primary)" /> Microgreen Admin</> : <><Icons.Tag size={24} color="var(--success)" /> {sellerName}</>}
          </h1>
          <div className="admin-header-actions">
            {!isOwner && (
              <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)' }}>
                Sotuvchi
              </span>
            )}
            {isOwner && <AdminNotifications />}
            <a href="/" className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'center' }}>
              <Icons.Home size={14} /> Sayt
            </a>
            <button onClick={handleLogout} className="btn btn-ghost btn-sm"
              style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239, 68, 68, 0.1)' }}>
              <Icons.LogOut size={14} /> Chiqish
            </button>
          </div>
        </div>

        <nav className="admin-tabs">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        {activeTab === 'pos' && <AdminPOS sellerName={isOwner ? 'Egasi' : sellerName} />}
        {activeTab === 'stats' && isOwner && <AdminStats />}
        {activeTab === 'revenue' && isOwner && <AdminRevenue />}
        {activeTab === 'inventory' && isOwner && <AdminInventory />}
        {activeTab === 'movements' && isOwner && <AdminMovements />}
        {activeTab === 'orders' && isOwner && <AdminOrders />}
        {activeTab === 'suppliers' && isOwner && <AdminSuppliers />}
        {activeTab === 'debts' && isOwner && <AdminDebts />}
        {activeTab === 'analytics' && isOwner && <AdminAnalytics />}
        {activeTab === 'forecast' && isOwner && <AdminForecast />}
        {activeTab === 'employees' && isOwner && <AdminEmployees />}
        {activeTab === 'products' && isOwner && <AdminProducts />}
        {activeTab === 'settings' && isOwner && <AdminSettings />}
      </main>
    </div>
  );
}
