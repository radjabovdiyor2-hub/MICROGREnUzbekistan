'use client';

import type { ReferralData } from './referralTypes';
import { ReferralRules } from './ReferralRules';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, ChevronRight, Percent, Share2, Users, XCircle } from 'lucide-react';

// Реферальный блок личного кабинета: код приглашения, ввод чужого кода,
// правила начисления. Вынесен из profile/page.tsx.

/** Реферальная статистика пользователя — из GET /api/referral. */

export function ReferralSection({ userId, referralCode, bonusPoints, lang, t }: {
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

  // Загрузка привязана к userId: мемоизация даёт ровно один запрос на
  // пользователя. Раньше от повторов страховал флаг loaded, но он же стоял в
  // зависимостях эффекта, и честный список зависимостей приходилось глушить.
  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/referral?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setReferralData(data);
      }
    } catch { /* ignore */ }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

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
        // Начисленный бонус виден только после перечитывания: раньше это
        // делалось сбросом флага loaded, теперь запрос вызывается напрямую.
        await loadData();
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
        <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(var(--overlay-light-rgb), 0.1)' }} />
        <div style={{ position: 'absolute', bottom: -30, left: -30, width: 80, height: 80, borderRadius: '50%', background: 'rgba(var(--overlay-light-rgb), 0.08)' }} />

        <div style={{ fontSize: 'var(--text-xs)', opacity: 0.8, marginBottom: 4 }}>
          {t('Bonus balansi', 'Бонусный баланс')}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: '28px', letterSpacing: '-0.5px' }}>
          {fmt(bonusPoints)} <span style={{ fontSize: '14px', fontWeight: 400, opacity: 0.8 }}>so&apos;m</span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
          <div style={{ background: 'rgba(var(--overlay-light-rgb), 0.15)', borderRadius: 'var(--radius-md)', padding: '6px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Users size={12} /> {referralData?.referralCount || 0} {t('taklif', 'приглашений')}
          </div>
          <div style={{ background: 'rgba(var(--overlay-light-rgb), 0.15)', borderRadius: 'var(--radius-md)', padding: '6px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
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

      {showRules && <ReferralRules t={t} />}
    </div>
  );
}
