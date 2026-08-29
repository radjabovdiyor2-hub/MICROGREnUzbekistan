'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Star, Trash } from 'lucide-react';
import {
  contactRoleLabel,
  decisionMaker,
  type ContactRole,
} from '@/lib/customers/contactRoles';
import { AdminContactForm } from './AdminContactForm';

// ══════════════════════════════════════════════════════════════════════
// Контактные лица заведения.
//
// ЗАЧЕМ. Продукт выбирает шеф, а закупку утверждает управляющий или
// владелец. Пока в карточке записано одно имя, разговор о цене уходит к
// тому, кто её не решает, и выясняется это в конце разговора.
//
// Звёздочкой отмечен тот, кто утверждает закупку. Если её не поставили,
// подсказка ниже предполагает владельца или управляющего — и прямо
// говорит, что это догадка, а не запись.
// ══════════════════════════════════════════════════════════════════════

interface Contact {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  decides: boolean;
}

interface Props {
  customerId: number;
  lang: 'ru' | 'uz';
}

export function AdminCustomerContacts({ customerId, lang }: Props) {
  const t = (ru: string, uz: string) => (lang === 'uz' ? uz : ru);
  const qc = useQueryClient();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<ContactRole>('chef');
  const [phone, setPhone] = useState('');
  const [decides, setDecides] = useState(false);

  const key = ['admin-customer-contacts', customerId];

  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/admin/customers/contacts?customerId=${customerId}`, {
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (json.status === 'ok') return json.contacts as Contact[];
      throw new Error(json.error || 'Не удалось загрузить');
    },
  });

  const reload = () => qc.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/customers/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ customerId, name, role, phone: phone || null, decides }),
      });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: () => {
      setName('');
      setPhone('');
      setDecides(false);
      setAdding(false);
      void reload();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/customers/contacts?id=${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: () => void reload(),
  });

  const contacts = data ?? [];
  const decider = decisionMaker(contacts);

  return (
    <div className="card" style={{ padding: 'var(--space-4)', borderRadius: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          {t('Контакты заведения', 'Muassasa kontaktlari')}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5 }}
          onClick={() => setAdding((v) => !v)}
        >
          <Plus size={13} /> {t('Добавить', "Qo'shish")}
        </button>
      </div>

      {contacts.length === 0 && !adding && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          {t(
            'Никого не записано. Шеф выбирает продукт, а закупку утверждает управляющий — знать стоит обоих.',
            'Hech kim yozilmagan. Oshpaz mahsulotni tanlaydi, xaridni menejer tasdiqlaydi.',
          )}
        </div>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        {contacts.map((c) => (
          <div
            key={c.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto auto',
              gap: 'var(--space-3)',
              alignItems: 'center',
              fontSize: 'var(--text-xs)',
            }}
          >
            <Star
              size={13}
              color={c.decides ? 'var(--warning)' : 'var(--text-muted)'}
              fill={c.decides ? 'var(--warning)' : 'none'}
            />
            <span>
              {c.name}
              <span style={{ color: 'var(--text-muted)' }}> · {contactRoleLabel(c.role)}</span>
            </span>
            <span style={{ color: 'var(--text-muted)' }}>{c.phone ?? ''}</span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => remove.mutate(c.id)}
              aria-label={t('Удалить', "O'chirish")}
            >
              <Trash size={13} />
            </button>
          </div>
        ))}
      </div>

      {decider && !decider.certain && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.45 }}>
          {t(
            `Кто утверждает закупку — не отмечено. Скорее всего ${decider.contact.name}, но это догадка: поставьте звёздочку, чтобы не выяснять в конце разговора.`,
            `Xaridni kim tasdiqlashi belgilanmagan. Ehtimol ${decider.contact.name}.`,
          )}
        </div>
      )}

      {adding && (
        <AdminContactForm
          lang={lang}
          name={name}
          setName={setName}
          role={role}
          setRole={setRole}
          phone={phone}
          setPhone={setPhone}
          decides={decides}
          setDecides={setDecides}
          busy={add.isPending}
          onSave={() => add.mutate()}
        />
      )}
    </div>
  );
}
