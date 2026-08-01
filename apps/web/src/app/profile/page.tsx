'use client';

import { useState } from 'react';
import { useTheme } from '@/components/providers/ThemeProvider';
import { useLang } from '@/components/providers/LangProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { TelegramLoginButton } from '@/components/auth/TelegramLoginButton';
import {
  ArrowLeft, CheckCircle, ChevronRight, Instagram, MessageCircle, Moon, Phone, Settings, Star, Sun, User,
} from 'lucide-react';
import { motion } from 'framer-motion';

const spring = { type: 'spring' as const, damping: 25, stiffness: 120 };
import { SimpleRegisterForm, UserOrders } from './ProfileSections';
import { ReferralSection } from './ReferralSection';

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

