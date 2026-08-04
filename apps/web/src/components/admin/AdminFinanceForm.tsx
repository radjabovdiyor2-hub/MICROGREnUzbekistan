'use client';

import React from 'react';
import { categoriesFor } from '@/lib/finance/categories';

interface Props {
  add: (e: React.FormEvent) => void;
  type: 'income' | 'expense';
  setType: (v: 'income' | 'expense') => void;
  amount: string;
  setAmount: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  t: (ru: string, uz: string) => string;
  inputStyle: React.CSSProperties;
}

export function AdminFinanceForm({
  add, type, setType, amount, setAmount, category, setCategory,
  date, setDate, description, setDescription, t, inputStyle,
}: Props) {
  return (
    <form onSubmit={add} className="card" style={{ padding: 'var(--space-5)', borderRadius: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)' }}>
        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
            {t('Тип', 'Tur')}
          </label>
          <select value={type} onChange={e => setType(e.target.value as 'income' | 'expense')} style={inputStyle}>
            <option value="expense">{t('Расход', 'Xarajat')}</option>
            <option value="income">{t('Доход', 'Daromad')}</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
            {t('Сумма', 'Summa')}
          </label>
          <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)}
            style={inputStyle} required />
        </div>
        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
            {t('Статья', 'Modda')}
          </label>
          {/* Список, а не свободный ввод: бот финансов пишет фиксированные
              слаги, и рукописная «аренда» рядом с ботовым `rent` давала две
              несвязанные строки в одном отчёте по категориям. */}
          <select value={category} onChange={e => setCategory(e.target.value)}
            style={inputStyle} required>
            <option value="">{t('— выберите —', '— tanlang —')}</option>
            {categoriesFor(type).map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
            {t('Дата операции', 'Amaliyot sanasi')}
          </label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
            {t('Комментарий', 'Izoh')}
          </label>
          <input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <button type="submit" className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }}>
        {t('Добавить', "Qo'shish")}
      </button>
    </form>
  );
}
