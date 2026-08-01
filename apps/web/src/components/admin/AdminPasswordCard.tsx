'use client';

import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

// Смена пароля владельца. Вынесена из AdminSettings — самостоятельный
// компонент, живший в чужом файле.

export function PasswordCard({ lang }: { lang: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)',
    borderRadius: '10px', background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)', outline: 'none',
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (newPassword.length < 6) {
      setMsg({ type: 'error', text: t('Минимум 6 символов', "Kamida 6 ta belgi") });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg({ type: 'error', text: t('Пароли не совпадают', "Parollar mos kelmadi") });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'change', currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: t('Пароль изменён', "Parol o'zgartirildi") });
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      } else {
        setMsg({ type: 'error', text: data.error || t('Ошибка', 'Xatolik') });
      }
    } catch {
      setMsg({ type: 'error', text: t('Ошибка сети', 'Tarmoq xatosi') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ padding: 'var(--space-5)', borderRadius: '18px', maxWidth: 460 }}>
      <h3 style={{
        fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)',
        fontSize: 'var(--text-base)', marginBottom: 'var(--space-4)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Lock size={18} /> {t('Пароль владельца', 'Egasi paroli')}
      </h3>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ position: 'relative' }}>
          <input type={show ? 'text' : 'password'} value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            placeholder={t('Текущий пароль', 'Joriy parol')}
            autoComplete="current-password" style={{ ...inputStyle, paddingRight: 40 }} />
          <button type="button" onClick={() => setShow(!show)}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
          placeholder={t('Новый пароль', 'Yangi parol')} autoComplete="new-password" style={inputStyle} />
        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
          placeholder={t('Повторите пароль', 'Parolni qayta kiriting')} autoComplete="new-password"
          style={{ ...inputStyle, borderColor: confirmPassword && confirmPassword !== newPassword ? 'var(--error)' : 'var(--border)' }} />

        {msg && (
          <div style={{
            padding: '8px 12px', borderRadius: 10, fontSize: 'var(--text-sm)', fontWeight: 600,
            background: msg.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
            color: msg.type === 'success' ? 'var(--success)' : 'var(--error)',
          }}>{msg.text}</div>
        )}

        <button type="submit" disabled={saving || !currentPassword || !newPassword} className="btn btn-primary">
          {saving ? t('Сохранение…', 'Saqlanmoqda…') : t('Изменить пароль', "Parolni o'zgartirish")}
        </button>
      </form>
    </div>
  );
}
