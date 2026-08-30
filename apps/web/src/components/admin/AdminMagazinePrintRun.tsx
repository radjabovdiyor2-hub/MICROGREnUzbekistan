'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useState } from 'react';

import { adminFetch, adminJsonArray } from '@/lib/adminClient';
import { useFeedback } from './AdminFeedback';

// ══════════════════════════════════════════════════════════════════════
// Счета за тираж вышедшего номера.
//
// ПОЧЕМУ ЗДЕСЬ, А НЕ НА ЭКРАНЕ НОМЕРОВ. Это деньги: сколько напечатать,
// кому выставить и сколько это принесло — вопрос той же вкладки, где
// видны подписки и неоплаченные счета. На экране номеров кнопка стояла
// рядом с публикацией, и «опубликовать» с «выставить счёт» путались.
//
// Повторный запуск безопасен: подписке, по которой счёт за этот номер уже
// выставлен, второй не создаётся.
// ══════════════════════════════════════════════════════════════════════
interface IssueOption {
  id: string;
  number: number;
  titleRu: string;
  isPublished: boolean;
}

export function AdminMagazinePrintRun({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const queryClient = useQueryClient();
  const notify = useFeedback();
  const [issueId, setIssueId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { data: issues = [] } = useQuery<IssueOption[]>({
    queryKey: ['admin-magazine-issues'],
    queryFn: () => adminJsonArray<IssueOption>('/api/admin/magazine/issues'),
  });

  const published = issues.filter((i) => i.isPublished);

  const run = async () => {
    if (!issueId) return;
    const issue = published.find((i) => i.id === issueId);
    const ok = await notify.confirm({
      title: t(`Выставить счета за номер №${issue?.number ?? ''}?`, 'Tiraj hisoblari?'),
      detail: t(
        'По каждой активной подписке будет создан счёт на печать. Уже выставленные не дублируются.',
        'Har bir faol obuna uchun hisob yaratiladi.',
      ),
      confirmText: t('Выставить', 'Yaratish'),
    });
    if (!ok) return;

    setBusy(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/magazine/print-run', {
        method: 'POST',
        body: JSON.stringify({ issueId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Не получилось');
      notify.success(t(
        `Счетов создано: ${data.ordersCreated} (подписок: ${data.subscriptions})`,
        `Hisoblar: ${data.ordersCreated}`,
      ));
      queryClient.invalidateQueries({ queryKey: ['mag-print-orders'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };

  if (published.length === 0) return null;

  return (
    <div className="card" style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
      <Printer size={16} />
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
        {t('Посчитать тираж по номеру', 'Son boʻyicha tiraj')}
      </span>
      <select className="input" style={{ flex: 1, minWidth: 180 }} value={issueId}
        onChange={(e) => setIssueId(e.target.value)}>
        <option value="">{t('— выберите номер —', '— sonni tanlang —')}</option>
        {published.map((i) => <option key={i.id} value={i.id}>№{i.number} · {i.titleRu}</option>)}
      </select>
      <button className="btn btn-sm" disabled={!issueId || busy} onClick={run}>
        {busy ? '…' : t('Выставить счета', 'Hisob yaratish')}
      </button>
      {error && <span style={{ color: 'var(--error)', fontSize: 'var(--text-sm)' }}>{error}</span>}
    </div>
  );
}
