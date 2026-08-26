'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { useState } from 'react';

import { AdminNotice } from './AdminNotice';
import { matchesQuery } from './AdminSearch';
import { useFeedback } from './AdminFeedback';

// ══════════════════════════════════════════════════════════════════════
// Заявки на печатный номер.
//
// ЧЕГО НЕ БЫЛО. `/api/admin/magazine/leads` принимал заявки и умел
// помечать оплату — и не имел ни одного потребителя во всём коде. То есть
// человек оставлял заявку на журнал в руки, строка ложилась в базу, и
// увидеть её было негде. Ни развезти, ни выставить счёт.
//
// ЖИВЁТ РЯДОМ С ДЕНЬГАМИ ЖУРНАЛА, а не отдельной вкладкой: подписка на
// тираж, счёт за печать и заявка на номер — один и тот же вопрос «кто
// сколько должен», и разводить его по вкладкам значит складывать в уме.
// ══════════════════════════════════════════════════════════════════════

interface Lead {
  id: string;
  phone: string | null;
  address: string | null;
  isPaid: boolean;
  createdAt: string;
}

const dateRu = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

export function AdminMagazinePrintLeads({ query, lang = 'ru' }: {
  query: string;
  lang?: 'ru' | 'uz';
}) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const queryClient = useQueryClient();
  const notify = useFeedback();
  const [error, setError] = useState('');

  const leads = useQuery<Lead[]>({
    queryKey: ['mag-print-leads'],
    queryFn: async () => {
      const res = await fetch('/api/admin/magazine/leads', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Не удалось загрузить');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const setPaid = async (id: string, isPaid: boolean) => {
    setError('');
    try {
      const res = await fetch('/api/admin/magazine/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id, isPaid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не получилось');
      notify.success(t('Сохранено', 'Saqlandi'));
      queryClient.invalidateQueries({ queryKey: ['mag-print-leads'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    }
  };

  const rows = (leads.data ?? []).filter((l) => matchesQuery(query, l.phone, l.address));
  const awaiting = rows.filter((l) => !l.isPaid).length;

  return (
    <div style={{ marginBottom: 'var(--space-5)' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>
        <Mail size={16} /> {t('Заявки на печатный номер', 'Bosma son uchun arizalar')}
        <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--font-normal)' }}>({rows.length})</span>
        {awaiting > 0 && (
          <span style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 'var(--font-normal)' }}>
            · {t('ждут оплаты', "to'lov kutmoqda")}: {awaiting}
          </span>
        )}
      </h3>

      <AdminNotice>{error}</AdminNotice>

      {rows.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>—</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((lead) => (
            <div key={lead.id} className="card" style={{ padding: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 'var(--font-semibold)' }}>
                  {lead.phone || t('телефон не указан', 'telefon yoʻq')}
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                  {[lead.address, dateRu(lead.createdAt)].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 12,
                background: lead.isPaid ? 'var(--success-bg)' : 'var(--bg-secondary)',
                color: lead.isPaid ? 'var(--success)' : 'var(--text-secondary)',
              }}>
                {lead.isPaid ? t('оплачено', "to'langan") : t('не оплачено', "to'lanmagan")}
              </span>
              <button className="btn btn-sm" onClick={() => setPaid(lead.id, !lead.isPaid)}>
                {lead.isPaid ? t('Снять отметку', 'Belgini olib tashlash') : t('Оплачено', "To'landi")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
