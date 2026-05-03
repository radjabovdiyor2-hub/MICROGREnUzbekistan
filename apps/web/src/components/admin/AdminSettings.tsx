'use client';

import { useState } from 'react';
import * as Icons from '@/components/ui/Icons';

export function AdminSettings() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (!currentPassword || !newPassword) {
      setPasswordMsg({ type: 'error', text: "Barcha maydonlarni to'ldiring" });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: "Yangi parol kamida 6 ta belgi bo'lishi kerak" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: "Parollar mos kelmadi" });
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordMsg({ type: 'error', text: "Yangi parol eski paroldan farqli bo'lishi kerak" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setPasswordMsg({ type: 'success', text: "Parol muvaffaqiyatli o'zgartirildi!" });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordMsg({ type: 'error', text: data.error || "Xatolik yuz berdi" });
      }
    } catch {
      setPasswordMsg({ type: 'error', text: "Tarmoq xatosi" });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '12px 14px', border: '1.5px solid var(--border)',
    borderRadius: '12px', background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)', outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <style>{`
        .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
        @media (max-width: 768px) { .settings-grid { grid-template-columns: 1fr; } }
        .pwd-input-wrap {
          position: relative; display: flex; align-items: center;
        }
        .pwd-input-wrap input { padding-right: 44px; }
        .pwd-toggle {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          background: none; border: none; color: var(--text-muted); cursor: pointer;
          padding: 4px; display: flex; align-items: center; justify-content: center;
          border-radius: var(--radius-sm); transition: color 0.15s;
        }
        .pwd-toggle:hover { color: var(--text-primary); }
        .pwd-strength { height: 4px; border-radius: var(--radius-full); background: var(--bg-tertiary); margin-top: 6px; overflow: hidden; }
        .pwd-strength-bar { height: 100%; border-radius: var(--radius-full); transition: width 0.3s, background 0.3s; }
      `}</style>

      <div className="settings-grid">
        {/* Password Change Card */}
        <div className="card" style={{
          padding: 'var(--space-6)', borderRadius: '20px',
          borderTop: '3px solid var(--brand-primary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 'var(--space-5)' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '14px',
              background: 'var(--brand-primary-light)', color: 'var(--brand-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icons.Lock size={24} />
            </div>
            <div>
              <h3 style={{
                fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)',
                fontSize: 'var(--text-lg)',
              }}>
                Parolni o&apos;zgartirish
              </h3>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Admin paneliga kirish parolini yangilang
              </p>
            </div>
          </div>

          <form onSubmit={handleChangePassword}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {/* Current Password */}
              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  Joriy parol
                </label>
                <div className="pwd-input-wrap">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Hozirgi parolni kiriting"
                    style={inputStyle}
                    autoComplete="current-password"
                  />
                  <button type="button" className="pwd-toggle" onClick={() => setShowCurrent(!showCurrent)}>
                    {showCurrent ? <Icons.EyeOff size={18} /> : <Icons.Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  Yangi parol
                </label>
                <div className="pwd-input-wrap">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Kamida 6 ta belgi"
                    style={inputStyle}
                    autoComplete="new-password"
                  />
                  <button type="button" className="pwd-toggle" onClick={() => setShowNew(!showNew)}>
                    {showNew ? <Icons.EyeOff size={18} /> : <Icons.Eye size={18} />}
                  </button>
                </div>
                {/* Strength indicator */}
                {newPassword && (
                  <div className="pwd-strength">
                    <div className="pwd-strength-bar" style={{
                      width: newPassword.length < 6 ? '25%' : newPassword.length < 10 ? '50%' : newPassword.length < 14 ? '75%' : '100%',
                      background: newPassword.length < 6 ? 'var(--error)' : newPassword.length < 10 ? '#F59E0B' : newPassword.length < 14 ? '#3B82F6' : 'var(--success)',
                    }} />
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  Yangi parolni tasdiqlang
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Parolni qayta kiriting"
                  style={{
                    ...inputStyle,
                    borderColor: confirmPassword && confirmPassword !== newPassword ? 'var(--error)' : 'var(--border)',
                  }}
                  autoComplete="new-password"
                />
                {confirmPassword && confirmPassword !== newPassword && (
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--error)', marginTop: 4 }}>Parollar mos kelmadi</p>
                )}
              </div>

              {/* Message */}
              {passwordMsg && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: passwordMsg.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
                  color: passwordMsg.type === 'success' ? 'var(--success)' : 'var(--error)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  {passwordMsg.type === 'success' ? <Icons.CheckCircle size={16} /> : <Icons.AlertTriangle size={16} />}
                  {passwordMsg.text}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={saving || !currentPassword || !newPassword || newPassword !== confirmPassword}
                className="btn btn-primary btn-lg"
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center',
                  borderRadius: '14px', opacity: saving ? 0.6 : 1,
                  marginTop: 'var(--space-2)',
                }}
              >
                {saving ? (
                  <><Icons.Clock size={18} style={{ animation: 'pulse 1s infinite' }} /> Saqlanmoqda...</>
                ) : (
                  <><Icons.Lock size={18} /> Parolni o&apos;zgartirish</>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* System Info Card */}
        <div className="card" style={{
          padding: 'var(--space-6)', borderRadius: '20px',
          borderTop: '3px solid var(--success)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 'var(--space-5)' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '14px',
              background: 'var(--success-bg)', color: 'var(--success)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icons.Settings size={24} />
            </div>
            <div>
              <h3 style={{
                fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)',
                fontSize: 'var(--text-lg)',
              }}>
                Tizim ma&apos;lumotlari
              </h3>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Platforma sozlamalari
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {[
              { label: 'Platforma', value: 'Microgreen Admin v2.0', icon: <Icons.Home size={16} /> },
              { label: 'Til', value: "O'zbek (UZ)", icon: <Icons.MessageCircle size={16} /> },
              { label: 'Valyuta', value: "So'm (UZS)", icon: <Icons.DollarSign size={16} /> },
              { label: 'Vaqt zonasi', value: 'Asia/Tashkent (UTC+5)', icon: <Icons.Clock size={16} /> },
              { label: 'Domen', value: 'Microgreen.uz', icon: <Icons.Zap size={16} /> },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                padding: '12px 14px', background: 'var(--bg-secondary)',
                borderRadius: '12px', transition: 'background 0.15s',
              }}>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{item.icon}</span>
                <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{item.label}</span>
                <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{item.value}</span>
              </div>
            ))}
          </div>

          {/* Security Tips */}
          <div style={{
            marginTop: 'var(--space-4)', padding: '14px',
            borderRadius: '12px', background: '#F59E0B10',
            border: '1px solid #F59E0B30',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Icons.Shield size={16} style={{ color: '#F59E0B' }} />
              <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: '#D97706' }}>Xavfsizlik maslahatlari</span>
            </div>
            <ul style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <span style={{ color: '#D97706', marginTop: 1 }}>•</span>
                Parolni har 30 kunda yangilang
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <span style={{ color: '#D97706', marginTop: 1 }}>•</span>
                Kuchli parol: harf + raqam + belgi
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <span style={{ color: '#D97706', marginTop: 1 }}>•</span>
                Parolni boshqalar bilan ulashmang
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
