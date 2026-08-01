'use client';

import React from 'react';
import { Send } from 'lucide-react';
import { DEPT_LABELS } from './adminTasksConfig';

interface Props {
  create: (e: React.FormEvent) => void;
  title: string;
  setTitle: (v: string) => void;
  department: string;
  setDepartment: (v: string) => void;
  priority: string;
  setPriority: (v: string) => void;
  deadline: string;
  setDeadline: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  departments: string[];
  t: (ru: string, uz: string) => string;
  inputStyle: React.CSSProperties;
}

export function AdminTaskForm({
  create, title, setTitle, department, setDepartment, priority, setPriority,
  deadline, setDeadline, description, setDescription, departments, t, inputStyle,
}: Props) {
  return (
    <form onSubmit={create} className="card" style={{ padding: 'var(--space-5)', borderRadius: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'var(--space-3)' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
            {t('Что нужно сделать', 'Nima qilish kerak')}
          </label>
          <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} required />
        </div>
        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
            {t('Отдел', "Bo'lim")}
          </label>
          <select value={department} onChange={e => setDepartment(e.target.value)} style={inputStyle}>
            {departments.map(d => <option key={d} value={d}>{DEPT_LABELS[d] ?? d}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
            {t('Приоритет', 'Muhimlik')}
          </label>
          <select value={priority} onChange={e => setPriority(e.target.value)} style={inputStyle}>
            <option value="low">{t('Низкий', 'Past')}</option>
            <option value="medium">{t('Средний', "O'rta")}</option>
            <option value="high">{t('Высокий', 'Yuqori')}</option>
            <option value="urgent">{t('Срочно', 'Shoshilinch')}</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
            {t('Срок', 'Muddat')}
          </label>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
            {t('Детали', 'Tafsilotlar')}
          </label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
      </div>

      <button type="submit" className="btn btn-primary"
        style={{ marginTop: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Send size={15} /> {t('Отправить боту отдела', "Bo'lim botiga yuborish")}
      </button>
    </form>
  );
}
