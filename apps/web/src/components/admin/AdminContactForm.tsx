'use client';

import React from 'react';
import { CONTACT_ROLES, CONTACT_ROLE_LABELS, type ContactRole } from '@/lib/customers/contactRoles';

// Форма нового контакта, вынесенная из AdminCustomerContacts: вместе они
// переваливали за предел размера компонента.

interface Props {
  lang: 'ru' | 'uz';
  name: string;
  setName: (v: string) => void;
  role: ContactRole;
  setRole: (v: ContactRole) => void;
  phone: string;
  setPhone: (v: string) => void;
  decides: boolean;
  setDecides: (v: boolean) => void;
  busy: boolean;
  onSave: () => void;
}

export function AdminContactForm({
  lang,
  name,
  setName,
  role,
  setRole,
  phone,
  setPhone,
  decides,
  setDecides,
  busy,
  onSave,
}: Props) {
  const t = (ru: string, uz: string) => (lang === 'uz' ? uz : ru);

  const input: React.CSSProperties = {
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-xs)',
  };

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 'var(--space-3)' }}>
      <input
        style={input}
        placeholder={t('Имя', 'Ism')}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <select style={input} value={role} onChange={(e) => setRole(e.target.value as ContactRole)}>
        {CONTACT_ROLES.map((r) => (
          <option key={r} value={r}>
            {CONTACT_ROLE_LABELS[r][lang]}
          </option>
        ))}
      </select>

      <input
        style={input}
        placeholder={t('Телефон', 'Telefon')}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />

      {/* Отметка «утверждает закупку» — не украшение: без неё разговор о
          цене уходит к тому, кто её не решает. */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)' }}>
        <input type="checkbox" checked={decides} onChange={(e) => setDecides(e.target.checked)} />
        {t('Утверждает закупку', 'Xaridni tasdiqlaydi')}
      </label>

      <button
        type="button"
        className="btn btn-sm btn-primary"
        disabled={!name.trim() || busy}
        onClick={onSave}
      >
        {t('Сохранить', 'Saqlash')}
      </button>
    </div>
  );
}
