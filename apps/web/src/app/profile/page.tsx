'use client';

import { useState } from 'react';
import { useTheme } from '@/components/providers/ThemeProvider';
import { useLang } from '@/components/providers/LangProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { TelegramLoginButton } from '@/components/auth/TelegramLoginButton';
import * as Icons from '@/components/ui/Icons';

export default function ProfilePage() {
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const { user, dbUser, isLoggedIn, logout, isLoading } = useAuth();

  const memberSince = dbUser?.createdAt
    ? new Date(dbUser.createdAt).toLocaleDateString(lang === 'uz' ? 'uz-UZ' : 'ru-RU', { year: 'numeric', month: 'long' })
    : null;

  return (
    <div className="container" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
      <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px', animation: 'page-enter 0.4s ease both' }}>
        <Icons.User size={28} /> {t('Profil', 'Профиль')}
      </h1>

      {/* Profile Card */}
      <div className="card glow-green" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)', animation: 'page-enter 0.5s ease 0.1s both' }}>
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
                <img
                  src={user.photo_url}
                  alt={user.first_name}
                  style={{
                    width: 72, height: 72, borderRadius: 'var(--radius-full)',
                    objectFit: 'cover', border: '3px solid var(--brand-primary)',
                  }}
                />
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
                {user.username && (
                  <p style={{ color: 'var(--brand-primary)', fontSize: 'var(--text-sm)' }}>
                    @{user.username}
                  </p>
                )}
                {memberSince && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginTop: 4 }}>
                    {t("A'zo bo'lgan", 'Участник с')}: {memberSince}
                  </p>
                )}
              </div>
            </div>

            {/* Stats Row */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)',
              marginTop: 'var(--space-4)', textAlign: 'center',
            }}>
              <div style={{
                padding: 'var(--space-3)', background: 'var(--brand-primary-light)',
                borderRadius: 'var(--radius-md)',
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-lg)', color: 'var(--brand-primary)' }}>
                  {dbUser?.bonusPoints || 0}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {t('Ball', 'Баллы')}
                </div>
              </div>
              <div style={{
                padding: 'var(--space-3)', background: 'var(--brand-accent-light)',
                borderRadius: 'var(--radius-md)',
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-lg)', color: 'var(--brand-accent)' }}>
                  <Icons.StarFilled size={18} style={{ verticalAlign: 'text-bottom' }} />
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {dbUser?.role === 'ADMIN' ? 'Admin' : t('Mijoz', 'Клиент')}
                </div>
              </div>
              <div style={{
                padding: 'var(--space-3)', background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-lg)', color: 'var(--success)' }}>
                  <Icons.CheckCircle size={18} style={{ verticalAlign: 'text-bottom' }} />
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {t('Faol', 'Активен')}
                </div>
              </div>
            </div>

            {/* Referral & Bonus Section */}
            <ReferralSection userId={dbUser?.id} referralCode={dbUser?.referralCode} bonusPoints={dbUser?.bonusPoints || 0} lang={lang} t={t} />
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <div style={{
                width: 72, height: 72, borderRadius: 'var(--radius-full)',
                background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '32px', color: 'white', fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)',
              }}>
                M
              </div>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xl)' }}>
                  {t('Mehmon', 'Гость')}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                  {t("Telegram orqali kiring", 'Войдите через Telegram')}
                </p>
              </div>
            </div>

            {/* Telegram Login */}
            <div style={{
              marginTop: 'var(--space-5)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 'var(--space-3)',
            }}>
              <TelegramLoginButton botName="Microgreenuzbekistan_bot" />
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textAlign: 'center' }}>
                {t(
                  "Telegram orqali xavfsiz kirish. Hech qanday parol kerak emas.",
                  "Безопасный вход через Telegram. Пароль не нужен."
                )}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Settings */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icons.Settings size={18} /> {t('Sozlamalar', 'Настройки')}
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
            <span>{theme === 'light' ? <Icons.Sun size={18} /> : <Icons.Moon size={18} />}</span>
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
            <Icons.MessageCircle size={18} />
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
            <Icons.Phone size={18} />
            <span>{t('Aloqa', 'Контакты')}: +998 94 999 95 99</span>
          </span>
          <Icons.ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
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
            <Icons.ArrowLeft size={18} />
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
          <Icons.Instagram size={16} /> Instagram
        </a>
        <a href="https://t.me/Microgreenuzbekistan_bot" target="_blank" rel="noopener noreferrer"
          className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icons.MessageCircle size={16} /> Telegram Bot
        </a>
        <a href="https://t.me/Microgreen_Uzbekistan" target="_blank" rel="noopener noreferrer"
          className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icons.MessageCircle size={16} /> {t('Kanal', 'Канал')}
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
  const [referralData, setReferralData] = useState<any>(null);
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

  // Load on first render
  if (userId && !loaded) loadData();

  const shortCode = referralData?.referralCode || (referralCode ? `AGRO-${referralCode.slice(-6).toUpperCase()}` : '...');
  const shareUrl = `https://Microgreen.uz?ref=${referralCode || ''}`;
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
        background: 'linear-gradient(135deg, #6366F1, #8B5CF6, #A855F7)',
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
            <Icons.Users size={12} /> {referralData?.referralCount || 0} {t('taklif', 'приглашений')}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 'var(--radius-md)', padding: '6px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Icons.Percent size={12} /> 3% {t("har xariddan", "с каждой покупки")}
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
          {copied ? <Icons.CheckCircle size={14} /> : <Icons.Share2 size={14} />} {copied ? t('Nusxalandi', 'Скопировано') : t('Ulashish', 'Поделиться')}
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
              {applyStatus.ok ? <Icons.CheckCircle size={12} /> : <Icons.XCircle size={12} />} {applyStatus.msg}
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
        <Icons.ChevronRight size={12} style={{ transform: showRules ? 'rotate(270deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }} /> {t("Bonus qoidalari", "Правила бонусов")}
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
