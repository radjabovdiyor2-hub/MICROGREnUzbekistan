'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, CheckCircle2, XCircle, Inbox, Bell, Trash2 } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Очередь «Ждёт вашего решения».
//
// Такого экрана не было, и это была настоящая дыра: заявки жили в Redis
// 15 минут и молча испарялись. Не нажал вовремя — намерение исчезло,
// задача навсегда осталась в `todo`, и узнать, что бот вообще чего-то
// просил, было негде. Здесь видно, сколько всего висит и как давно.
//
// Кнопки ✅ здесь нет намеренно: выполняет заявку офис (shared/approvals.py),
// у витрины нет ни его инструментов, ни шины. Одобрение — в Telegram,
// где карточка и пришла. Отсюда можно снять неактуальное.
// ══════════════════════════════════════════════════════════════════════

interface ApprovalItem {
  id: number;
  kind: string;
  summary: string;
  botName: string;
  status: string;
  remindCount: number;
  createdAt: string;
  decidedAt: string | null;
}

const STATUS_VIEW: Record<string, { icon: typeof Clock; color: string; ru: string }> = {
  pending: { icon: Clock, color: 'var(--warning)', ru: 'Ждёт решения' },
  approved: { icon: CheckCircle2, color: 'var(--success)', ru: 'Одобрено' },
  rejected: { icon: XCircle, color: 'var(--text-muted)', ru: 'Отклонено' },
};

function waitedFor(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return 'меньше часа';
  if (hours < 24) return `${hours} ч`;
  return `${Math.floor(hours / 24)} дн`;
}

export function AdminApprovals({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-approvals', showAll],
    queryFn: async () => {
      const res = await fetch(`/api/admin/approvals${showAll ? '?all=1' : ''}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('Failed to load approvals');
      return res.json() as Promise<{ pendingCount: number; approvals: ApprovalItem[] }>;
    },
    refetchInterval: 60_000,
  });

  const items = data?.approvals ?? [];

  const drop = async (item: ApprovalItem) => {
    if (!confirm(t(`Снять заявку «${item.summary.slice(0, 60)}»?`, 'Bekor qilinsinmi?'))) return;
    setBusyId(item.id);
    try {
      await fetch(`/api/admin/approvals?id=${item.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      await refetch();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600, fontSize: 'var(--text-lg)' }}>
          {t('Ждут вашего решения: ', 'Qaroringizni kutmoqda: ')}
          <span style={{ color: data?.pendingCount ? 'var(--warning)' : 'var(--success)' }}>
            {data?.pendingCount ?? 0}
          </span>
        </div>
        <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }}
          onClick={() => setShowAll(!showAll)}>
          {showAll ? t('Только ожидающие', 'Faqat kutayotgan') : t('Показать все', "Hammasi")}
        </button>
      </div>

      <div className="card" style={{ padding: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        {t(
          'Одобрять — кнопками под карточкой в Telegram: выполняет заявку офис. Здесь видно, что висит и как давно; отсюда можно снять неактуальное.',
          'Tasdiqlash — Telegramdagi tugmalar orqali.',
        )}
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-6)' }}>
          {t('Загрузка…', 'Yuklanmoqda…')}
        </div>
      ) : !items.length ? (
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Inbox size={28} style={{ marginBottom: 8 }} />
          <div>{t('Ничего не ждёт решения', "Hech narsa kutilmayapti")}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => {
            const view = STATUS_VIEW[item.status] ?? STATUS_VIEW.pending;
            const Icon = view.icon;
            return (
              <div key={item.id} className="card" style={{
                padding: 'var(--space-4)', borderRadius: 12,
                borderLeft: `3px solid ${view.color}`,
                display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap',
              }}>
                <Icon size={18} style={{ color: view.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{item.summary}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span>{item.botName}</span>
                    <span>{item.kind}</span>
                    {item.status === 'pending' && <span>{t('ждёт ', 'kutmoqda ')}{waitedFor(item.createdAt)}</span>}
                    {item.remindCount > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Bell size={11} /> {item.remindCount}
                      </span>
                    )}
                  </div>
                </div>
                {item.status === 'pending' && (
                  <button className="btn btn-sm btn-ghost" style={{ color: 'var(--error)' }}
                    disabled={busyId === item.id} onClick={() => drop(item)}
                    title={t('Снять заявку', 'Bekor qilish')}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
