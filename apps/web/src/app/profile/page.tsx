'use client';

import { useState } from 'react';
import { useTheme } from '@/components/providers/ThemeProvider';
import { useLang } from '@/components/providers/LangProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { TelegramLoginButton } from '@/components/auth/TelegramLoginButton';
import {
  Instagram, MessageCircle, Star, User,
} from 'lucide-react';
import { motion } from 'framer-motion';

const spring = { type: 'spring' as const, damping: 25, stiffness: 120 };
import { SimpleRegisterForm, UserOrders } from './ProfileSections';
import { ReferralSection } from './ReferralSection';
import { ProfileSettingsCard } from './ProfileSettingsCard';

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
                <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {user.first_name} {user.last_name}
                  {dbUser?.role === 'ADMIN' && (
                    <span style={{ fontSize: 10, background: 'var(--brand-primary)', color: 'white', padding: '2px 6px', borderRadius: 12, fontWeight: 800 }}>ADMIN</span>
                  )}
                </h2>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {dbUser?.phone || '@' + user.username}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-5)', paddingTop: 'var(--space-5)', borderTop: '1px solid rgba(var(--brand-primary-rgb), 0.15)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 2 }}>{t("Bonuslar", "Бонусы")}</div>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-extrabold)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Star size={16} fill="currentColor" /> {dbUser?.bonusPoints || 0}
                </div>
              </div>
              <div style={{ flex: 1, borderLeft: '1px solid rgba(var(--brand-primary-rgb), 0.15)', paddingLeft: 'var(--space-4)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 2 }}>{t("Ro'yxatdan o'tgan", "В системе с")}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {memberSince || '...'}
                </div>
              </div>
            </div>

            {/* Referral Section inline inside Profile card */}
            <div style={{ marginTop: 'var(--space-6)' }}>
              <ReferralSection userId={dbUser?.id} referralCode={dbUser?.referralCode} bonusPoints={dbUser?.bonusPoints || 0} lang={lang} t={t} />
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 'var(--space-5)' }}>
              <div style={{
                width: 64, height: 64, borderRadius: 'var(--radius-full)', background: 'var(--bg-tertiary)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', marginBottom: 'var(--space-3)'
              }}>
                <User size={32} />
              </div>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', marginBottom: 4 }}>
                {t('Xush kelibsiz', 'Добро пожаловать')}
              </h2>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {t('Kirish yoki ro\'yxatdan o\'tish', 'Войдите или зарегистрируйтесь')}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
              <button onClick={() => setAuthTab('simple')} style={{
                flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 700,
                background: authTab === 'simple' ? 'var(--bg-card)' : 'transparent',
                color: authTab === 'simple' ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: authTab === 'simple' ? '0 1px 3px rgba(var(--overlay-dark-rgb), 0.1)' : 'none', transition: 'all 0.2s',
              }}>{t("Tezkor", "Быстро")}</button>
              <button onClick={() => setAuthTab('telegram')} style={{
                flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 700,
                background: authTab === 'telegram' ? 'var(--bg-card)' : 'transparent',
                color: authTab === 'telegram' ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: authTab === 'telegram' ? '0 1px 3px rgba(var(--overlay-dark-rgb), 0.1)' : 'none', transition: 'all 0.2s',
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

      {/* Subscriptions */}

      {/* Orders */}
      {isLoggedIn && <UserOrders />}

      {/* Settings */}
      <ProfileSettingsCard
        theme={theme}
        toggleTheme={toggleTheme}
        lang={lang}
        setLang={setLang}
        t={t}
        isLoggedIn={isLoggedIn}
        logout={logout}
      />

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

