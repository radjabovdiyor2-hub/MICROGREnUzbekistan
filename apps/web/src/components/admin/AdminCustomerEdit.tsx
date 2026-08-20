'use client';

import type { Dispatch, SetStateAction } from 'react';
import { X } from 'lucide-react';

import {
  AUDIENCES,
  AUDIENCE_META,
  AUDIENCE_RELEVANT,
  COMPANY_TYPE_GROUPS,
  GROUP_META,
  typesOfGroup,
} from '@/lib/customers/companyTypes';

import type { CustomerItem } from './customerTypes';

// Модалка правки клиента: статус, тип заведения, аудитория, бонусы, заметки.
// Стили — инлайн на токенах, как в остальной админке.

interface Props {
  editingCustomer: CustomerItem | null;
  setEditingCustomer: Dispatch<SetStateAction<CustomerItem | null>>;
  editStatus: string;
  setEditStatus: Dispatch<SetStateAction<string>>;
  editBonus: number;
  setEditBonus: Dispatch<SetStateAction<number>>;
  editNotes: string;
  setEditNotes: Dispatch<SetStateAction<string>>;
  editCompanyType: string;
  setEditCompanyType: Dispatch<SetStateAction<string>>;
  editAudience: string;
  setEditAudience: Dispatch<SetStateAction<string>>;
  saving: boolean;
  handleSaveCustomer: () => void;
}

// Ровно те значения, которые допускает база (CHECK на customers.status).
// Раньше здесь предлагались «client» и «blocked» — таких статусов не
// существует, и сохранение записывало в базу значение, по которому потом
// никакой фильтр клиента не находил.
const STATUS_OPTIONS = [
  { value: 'lead', label: 'Лид' },
  { value: 'active', label: 'Активный клиент' },
  { value: 'vip', label: 'VIP' },
  { value: 'churned', label: 'Ушедший' },
];

const label: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  fontWeight: 'var(--font-semibold)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  display: 'block',
  marginBottom: 4,
};

const field: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 'var(--text-sm)',
};

export function AdminCustomerEdit({
  editingCustomer, setEditingCustomer, editStatus, setEditStatus,
  editBonus, setEditBonus, editNotes, setEditNotes,
  editCompanyType, setEditCompanyType, editAudience, setEditAudience,
  saving, handleSaveCustomer,
}: Props) {
  if (!editingCustomer) return null;

  return (
    <div
      onClick={() => setEditingCustomer(null)}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'var(--bg-overlay)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          padding: 'var(--space-5)',
          width: '100%',
          maxWidth: 460,
          // Длинная форма на невысоком экране должна прокручиваться внутри
          // себя, а не уезжать за край окна вместе с кнопкой «Сохранить».
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>
            Клиент #{editingCustomer.id}
          </h3>
          <button onClick={() => setEditingCustomer(null)} className="btn btn-ghost btn-sm" aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <span style={label}>Имя клиента</span>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)' }}>{editingCustomer.name}</div>
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={label} htmlFor="cust-status">Статус</label>
          <select id="cust-status" value={editStatus} onChange={(e) => setEditStatus(e.target.value)} style={field}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={label} htmlFor="cust-type">Тип заведения</label>
          <select id="cust-type" value={editCompanyType}
            onChange={(e) => setEditCompanyType(e.target.value)} style={field}>
            <option value="">Не указан</option>
            {COMPANY_TYPE_GROUPS.map((group) => (
              <optgroup key={group} label={GROUP_META[group].ru}>
                {typesOfGroup(group).map(({ slug, meta }) => (
                  <option key={slug} value={slug}>{meta.ru}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Пол зала спрашиваем только у фитнеса, спорта и тойхон — там это
            разные закупщики и разное предложение. Справочники этот признак
            не проставляют вовсе, сборщик лишь угадывает по названию, так
            что настоящий источник правды — вот это поле.

            Сохранённое здесь помечается как ручное, и ночной сбор своей
            догадкой его больше не затирает. */}
        {AUDIENCE_RELEVANT.includes(editCompanyType) && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={label} htmlFor="cust-audience">Аудитория</label>
            <select id="cust-audience" value={editAudience}
              onChange={(e) => setEditAudience(e.target.value)} style={field}>
              <option value="">Не выяснено</option>
              {AUDIENCES.map((slug) => (
                <option key={slug} value={slug}>{AUDIENCE_META[slug].ru}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={label} htmlFor="cust-bonus">Бонусные баллы</label>
          <input id="cust-bonus" type="number" value={editBonus}
            onChange={(e) => setEditBonus(Number(e.target.value))} style={field} />
        </div>

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <label style={label} htmlFor="cust-notes">Заметки менеджера</label>
          <textarea id="cust-notes" value={editNotes} rows={3}
            onChange={(e) => setEditNotes(e.target.value)}
            style={{ ...field, resize: 'vertical' }}
            placeholder="Заметки о клиенте…" />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button onClick={() => setEditingCustomer(null)} className="btn btn-ghost btn-sm">Отмена</button>
          <button onClick={handleSaveCustomer} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
