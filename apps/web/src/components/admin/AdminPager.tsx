'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

// Постраничная навигация для длинных списков админки.
//
// Списки обрывались молча: клиенты жёстко на сотне, заказы на двадцати
// последних (столько отдаёт /api/orders без параметров). Отличить «записей
// больше нет» от «дальше не влезло» было нечем.
//
// Именно страницы, а не накопительное «показать ещё»: `limit` на сервере
// ограничен сотней, и кнопка догрузки перестала бы работать на третьем
// нажатии — так же тихо, как обрыв, который она чинит.

const T = {
  back: { ru: 'Назад', uz: 'Orqaga' },
  forward: { ru: 'Вперёд', uz: 'Oldinga' },
  of: { ru: 'из', uz: 'dan' },
  page: { ru: 'стр.', uz: 'sahifa' },
};

export function AdminPager({ page, total, pageSize, onPage, lang }: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  lang: 'ru' | 'uz';
}) {
  const t = (k: keyof typeof T) => T[k][lang];
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-3)',
      marginTop: 'var(--space-3)',
      flexWrap: 'wrap',
    }}>
      <button
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className="btn btn-ghost btn-sm"
        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <ChevronLeft size={14} /> {t('back')}
      </button>

      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {from}–{to} {t('of')} {total}
        {pages > 1 ? ` · ${t('page')} ${page} ${t('of')} ${pages}` : ''}
      </span>

      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= pages}
        className="btn btn-ghost btn-sm"
        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
      >
        {t('forward')} <ChevronRight size={14} />
      </button>
    </div>
  );
}
