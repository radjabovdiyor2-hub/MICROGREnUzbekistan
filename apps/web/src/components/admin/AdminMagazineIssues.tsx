'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { AdminNotice } from './AdminNotice';
import { useFeedback } from './AdminFeedback';

// ══════════════════════════════════════════════════════════════════════
// Персональные номера ресторанов внутри выпуска.
//
// Схема журнала — 50/50: общая часть недели (`MagazineEdition`) и
// персональная часть заведения (`RestaurantIssue`). Вторая половина
// существовала только в базе: посмотреть, у кого номер готов, а у кого
// висит черновиком, было негде, и «выпуск ушёл в печать» означало
// «крон отработал» — без ответа на вопрос, что именно он напечатал.
//
// Статус здесь МЕНЯЕТСЯ руками намеренно: черновик становится готовым,
// когда человек посмотрел содержимое, а не когда прошло время.
// ══════════════════════════════════════════════════════════════════════

interface Issue {
  id: string;
  status: string;
  webSlug: string;
  pdfUrl: string | null;
  restaurant?: { name: string | null } | null;
}

const STATUS: Record<string, { ru: string; uz: string; color: string; bg: string }> = {
  draft: { ru: 'черновик', uz: 'qoralama', color: 'var(--text-muted)', bg: 'var(--bg-secondary)' },
  ready: { ru: 'готов', uz: 'tayyor', color: 'var(--info)', bg: 'var(--info-bg)' },
  published: { ru: 'опубликован', uz: 'eʼlon qilingan', color: 'var(--success)', bg: 'var(--success-bg)' },
};

/** Куда можно перевести номер из текущего состояния. */
const NEXT: Record<string, string[]> = {
  draft: ['ready'],
  ready: ['published', 'draft'],
  published: ['ready'],
};

export function AdminMagazineIssues({ editionId, title, onBack, lang = 'ru' }: {
  editionId: string;
  title: string;
  onBack: () => void;
  lang?: 'ru' | 'uz';
}) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const queryClient = useQueryClient();
  const notify = useFeedback();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const { data: issues = [], isPending } = useQuery<Issue[]>({
    queryKey: ['admin-magazine-issues', editionId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/magazine/issues?editionId=${editionId}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('Не удалось загрузить номера');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const setStatus = async (issue: Issue, status: string) => {
    setBusy(issue.id);
    setError('');
    try {
      const res = await fetch('/api/admin/magazine/issues', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: issue.id, status }),
      });
      if (!res.ok) throw new Error('Не удалось изменить статус');
      notify.success(t('Статус изменён', 'Status oʻzgardi'));
      queryClient.invalidateQueries({ queryKey: ['admin-magazine-issues', editionId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    } finally {
      setBusy('');
    }
  };

  return (
    <div>
      <button onClick={onBack} className="btn btn-ghost btn-sm"
        style={{ marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <ArrowLeft size={16} /> {t('К выпускам', 'Sonlarga')}
      </button>

      <h3 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)' }}>{title}</h3>

      <AdminNotice>{error}</AdminNotice>

      {isPending && <div style={{ color: 'var(--text-muted)' }}>{t('Загрузка…', 'Yuklanmoqda…')}</div>}

      {!isPending && issues.length === 0 && (
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
          {t(
            'В этом выпуске нет ни одного ресторана. Черновики создаёт «Подготовить следующий» — по ресторанам с отметкой партнёра журнала.',
            'Bu sonda restoran yoʻq.',
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {issues.map((i) => {
          const st = STATUS[i.status] ?? STATUS.draft;
          return (
            <div key={i.id} className="card" style={{ padding: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 'var(--font-semibold)' }}>
                  {i.restaurant?.name || t('без названия', 'nomsiz')}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{i.webSlug}</div>
              </div>

              <span style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 'bold',
                background: st.bg, color: st.color,
              }}>
                {t(st.ru, st.uz)}
              </span>

              {/* Ссылка на читалку: решение «готов ли номер» принимают,
                  посмотрев на него, а не на строку в списке. */}
              <a className="btn btn-ghost btn-sm" href={`/magazine/r/${i.webSlug}`}
                target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ExternalLink size={14} /> {t('Открыть', 'Ochish')}
              </a>

              {(NEXT[i.status] ?? []).map((next) => (
                <button key={next} className="btn btn-sm" disabled={busy === i.id}
                  onClick={() => setStatus(i, next)}>
                  {t(STATUS[next].ru, STATUS[next].uz)}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
