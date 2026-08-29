'use client';

import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Trash2 } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';

// ══════════════════════════════════════════════════════════════════════
// Ключи входа: Face ID, Touch ID, отпечаток на телефоне.
//
// Привязать ключ можно ТОЛЬКО отсюда, то есть уже войдя паролем. Иначе
// первый, кто открыл страницу входа, привязал бы к админке свой палец.
//
// Пароль при этом никуда не девается и остаётся главным: ключ — быстрый
// способ входа с СВОЕГО устройства, а не замена паролю. Потерял телефон —
// заходишь паролем и снимаешь ключ здесь же.
// ══════════════════════════════════════════════════════════════════════

interface Key {
  id: string;
  label: string;
  createdAt: string;
}

const text = {
  title: { ru: 'Вход по Face ID / Touch ID', uz: 'Face ID / Touch ID bilan kirish' },
  hint: {
    ru: 'Быстрый вход с этого устройства. Пароль продолжает работать — ключ его не заменяет.',
    uz: 'Shu qurilmadan tez kirish. Parol ishlashda davom etadi.',
  },
  add: { ru: 'Привязать это устройство', uz: 'Shu qurilmani bogʻlash' },
  adding: { ru: 'Подтвердите на устройстве…', uz: 'Qurilmada tasdiqlang…' },
  empty: { ru: 'Ключей пока нет', uz: 'Hali kalitlar yoʻq' },
  remove: { ru: 'Снять', uz: 'Olib tashlash' },
  named: { ru: 'Название устройства — «iPhone владельца»', uz: 'Qurilma nomi' },
  unsupported: {
    ru: 'Этот браузер не умеет ключи входа — останется пароль.',
    uz: 'Bu brauzer kirish kalitlarini qoʻllamaydi — parol qoladi.',
  },
  cancelled: { ru: 'Привязка отменена', uz: 'Bogʻlash bekor qilindi' },
};

async function call(payload: Record<string, unknown>) {
  const res = await fetch('/api/auth/webauthn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Не получилось');
  return data;
}

export function PasskeyCard({ lang }: { lang: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const [keys, setKeys] = useState<Key[]>([]);
  const [busy, setBusy] = useState(false);
  // Имя устройства спрашиваем полем, а не `prompt`: системное окно в
  // Telegram Mini App выглядит как ошибка операционной системы, и оно же
  // запрещено линтером проекта по той же причине (см. AdminFeedback).
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(() => {
    call({ action: 'list' })
      .then((d) => setKeys(Array.isArray(d.credentials) ? d.credentials : []))
      .catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  const supported =
    typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';

  const add = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const opt = await call({ action: 'register-options' });
      const credential = await startRegistration({ optionsJSON: opt.publicKey });
      await call({
        action: 'register-verify',
        sessionId: opt.sessionId,
        credential,
        label: label.trim() || t('Моё устройство', 'Mening qurilmam'),
      });
      setMsg({ type: 'success', text: t('Устройство привязано', 'Qurilma bogʻlandi') });
      setLabel('');
      load();
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      setMsg({
        type: 'error',
        text: name === 'NotAllowedError'
          ? text.cancelled[lang]
          : String((error as Error)?.message || 'Не получилось'),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setMsg(null);
    try {
      await call({ action: 'delete', credentialId: id });
      load();
    } catch (error) {
      setMsg({ type: 'error', text: String((error as Error)?.message || 'Не получилось') });
    }
  };

  return (
    <div className="card" style={{ padding: 'var(--space-5)', borderRadius: '18px', display: 'grid', gap: 'var(--space-3)' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Fingerprint size={18} /> {text.title[lang]}
      </h3>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>
        {supported ? text.hint[lang] : text.unsupported[lang]}
      </p>

      {keys.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>
          {text.empty[lang]}
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {keys.map((k) => (
            <div
              key={k.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
              }}
            >
              <span style={{ flex: 1, fontSize: 'var(--text-sm)' }}>{k.label}</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {new Date(k.createdAt).toLocaleDateString('ru-RU')}
              </span>
              <button
                type="button"
                onClick={() => remove(k.id)}
                className="btn btn-ghost btn-sm"
                title={text.remove[lang]}
                style={{ color: 'var(--error)' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {supported && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={text.named[lang]}
            maxLength={60}
            style={{
              flex: '1 1 180px', padding: '10px 12px', border: '1.5px solid var(--border)',
              borderRadius: '10px', background: 'var(--bg-primary)',
              color: 'var(--text-primary)', fontSize: 'var(--text-sm)', outline: 'none',
            }}
          />
          <button type="button" onClick={add} disabled={busy} className="btn btn-outline">
            {busy ? text.adding[lang] : text.add[lang]}
          </button>
        </div>
      )}

      {msg && (
        <div style={{
          fontSize: 'var(--text-sm)', fontWeight: 600,
          color: msg.type === 'success' ? 'var(--success)' : 'var(--error)',
        }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
