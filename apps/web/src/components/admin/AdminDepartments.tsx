'use client';

import React, { useState } from 'react';
import { AdminDepartment } from './AdminDepartment';

// ══════════════════════════════════════════════════════════════════════
// Отделы ИИ-офиса — один экран вместо десяти вкладок.
//
// ЗАЧЕМ. Десять отделов были заведены десятью пунктами меню, хотя за
// всеми стоял ОДИН компонент с разным идентификатором. Пятая часть всего
// меню админки уходила на один экран, а перейти из продаж в маркетинг
// значило вернуться в список вкладок и найти нужную среди полусотни.
//
// Список отделов держится здесь, а не приходит из API: он совпадает с
// реестром ботов (`apps/tgas/shared/bot_registry.py`) и меняется вместе с
// кодом. Тянуть его по сети значило бы показывать пустое меню, пока
// ИИ-офис недоступен, — а он лежит чаще, чем меняется состав отделов.
// ══════════════════════════════════════════════════════════════════════

interface Dept {
  id: string;
  ru: string;
  uz: string;
}

/** Порядок — по тому, как часто в отдел заходят, а не по алфавиту. */
export const DEPARTMENTS: Dept[] = [
  { id: 'sales', ru: 'Продажи', uz: 'Sotuvlar' },
  { id: 'marketing', ru: 'Маркетинг', uz: 'Marketing' },
  { id: 'content', ru: 'Контент', uz: 'Kontent' },
  { id: 'finance', ru: 'Финансы', uz: 'Moliya' },
  { id: 'analytics', ru: 'Аналитика', uz: 'Analitika' },
  { id: 'hr', ru: 'Кадры (HR)', uz: 'Kadrlar (HR)' },
  { id: 'support', ru: 'Поддержка', uz: "Qo'llab-quvvatlash" },
  { id: 'qa', ru: 'QA / Качество', uz: 'QA / Sifat' },
  { id: 'devops', ru: 'DevOps / IT', uz: 'DevOps / IT' },
  { id: 'rnd', ru: 'R&D', uz: 'R&D' },
];

export function AdminDepartments({ lang }: { lang: 'ru' | 'uz' }) {
  const [active, setActive] = useState('sales');
  const dept = DEPARTMENTS.find((d) => d.id === active) ?? DEPARTMENTS[0];

  return (
    <div>
      {/* Переключатель прокручивается, а не переносится: десять отделов в
          две строки съедали бы верх экрана на телефоне. */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 6,
          marginBottom: 'var(--space-3)',
        }}
      >
        {DEPARTMENTS.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`btn btn-sm ${d.id === active ? 'btn-primary' : 'btn-outline'}`}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={() => setActive(d.id)}
          >
            {lang === 'uz' ? d.uz : d.ru}
          </button>
        ))}
      </div>

      {/* Ключ по отделу: у экрана отдела свой фильтр задач, и при переходе
          в другой отдел он должен начинаться заново, а не показывать
          «просроченные» от предыдущего. */}
      <AdminDepartment
        key={dept.id}
        departmentId={dept.id}
        departmentName={lang === 'uz' ? dept.uz : dept.ru}
        lang={lang}
      />
    </div>
  );
}
