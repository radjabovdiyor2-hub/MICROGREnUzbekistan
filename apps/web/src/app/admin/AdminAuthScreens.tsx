'use client';

import Link from 'next/link';

import { PasskeyLoginButton } from './PasskeyLoginButton';
import type { Dispatch, SetStateAction } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, Home, Lock, Settings, Tag } from 'lucide-react';

// Экраны входа в админку: выбор роли, пароль владельца, PIN продавца.
// Вынесены из AdminShell — до входа основная панель не рендерится вовсе,
// так что это отдельный режим экрана, а не её часть.

export type AuthMode = 'choose' | 'owner_login' | 'seller_login';

interface Props {
  authMode: AuthMode;
  setAuthMode: (m: AuthMode) => void;
  password: string;
  setPassword: (v: string) => void;
  pin: string;
  setPin: Dispatch<SetStateAction<string>>;
  authError: string;
  setAuthError: (v: string) => void;
  handleOwnerLogin: (e: React.FormEvent) => void;
  handlePinPress: (digit: number) => void;
  t: (ru: string, uz: string) => string;
  /** Язык нужен вложенным кнопкам, у которых своих подписей больше двух. */
  lang: 'ru' | 'uz';
}

export function AdminAuthScreens({
  authMode, setAuthMode, password, setPassword, pin, setPin,
  authError, setAuthError, handleOwnerLogin, handlePinPress, t, lang,
}: Props) {
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
          
          {/* Вход по Face ID / Touch ID вернулся — теперь с проверкой
              подписи (`@simplewebauthn`). Кнопка сама себя не показывает,
              пока к админке не привязан ни один ключ: кнопка, которая
              гарантированно не работает, хуже её отсутствия. */}
          <PasskeyLoginButton lang={lang} onError={setAuthError} />

          <button type="submit" className="btn btn-primary btn-lg btn-block" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
            <ArrowRight size={18} /> {t('Войти по паролю', 'Parol bilan kirish')}
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
              <button key={i} onClick={() => handlePinPress(key as number)}
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

  return null;
}
