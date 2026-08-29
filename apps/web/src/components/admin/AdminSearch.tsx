'use client';

import { Search, X } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Поиск по списку — один на все экраны админки.
//
// Поиска не было на одиннадцати экранах из тридцати восьми: поставщики,
// долги, сотрудники, смены, финансы, промокоды, категории, задачи, склад.
// Пока записей десяток, это незаметно; на сотне «найти долг Плов Центра»
// превращается в прокрутку глазами — то есть в работу, которой быть не
// должно.
//
// Фильтрация КЛИЕНТСКАЯ и это осознанно: перечисленные экраны грузят весь
// список разом и живут на сотнях записей, а не на десятках тысяч. Серверный
// поиск здесь означал бы новый параметр в девяти роутах ради того же
// результата. Там, где записей действительно много (клиенты, заказы),
// поиск уже серверный и остаётся таким.
// ══════════════════════════════════════════════════════════════════════

export function AdminSearch({ value, onChange, placeholder = 'Поиск', width = 220 }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: number | string;
}) {
  return (
    <div style={{ position: 'relative', flex: `0 1 ${typeof width === 'number' ? `${width}px` : width}` }}>
      <Search
        size={14}
        style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-muted)', pointerEvents: 'none',
        }}
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{
          width: '100%',
          padding: '8px 28px 8px 30px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontSize: 'var(--text-sm)',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Очистить поиск"
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', padding: 2,
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * Совпадает ли запись с запросом.
 *
 * Регистр не важен, лишние пробелы тоже: человек ищет «плов центр», а в
 * базе «Плов Центр». Пустой запрос совпадает со всем — экран без ввода
 * обязан показывать полный список, а не пустоту.
 */
export function matchesQuery(query: string, ...fields: (string | number | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f != null && String(f).toLowerCase().includes(q));
}
