'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Check, CheckCircle2, Clock, Inbox, Trash2, X, XCircle } from 'lucide-react';

import { AdminNotice, type NoticeTone } from './AdminNotice';
import { useFeedback } from './AdminFeedback';

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
  const notify = useFeedback();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);

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
    const what = item.summary.slice(0, 60);
    const ok = await notify.confirm({
      title: t(`Снять заявку «${what}»?`, `«${what}» olib tashlansinmi?`),
      detail: t(
        'Действие НЕ выполнится, заявка просто уйдёт из очереди.',
        'Amal BAJARILMAYDI, faqat navbatdan chiqadi.',
      ),
      confirmText: t('Снять', 'Olib tashlash'),
    });
    if (!ok) return;
    setBusyId(item.id);
    setNotice(null);
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

  /**
   * Решить заявку: выполнить или отказать.
   *
   * Работу делает офис — у витрины нет ни инструментов, ни шины. Здесь
   * только передача решения и честный показ того, чем оно закончилось:
   * заявка может быть одобрена, а действие всё равно не выполниться
   * (витрина не ответила, данных не хватило), и рапортовать об успехе в
   * этом случае значит записать несделанное в сделанное.
   */
  const decide = async (item: ApprovalItem, decision: 'approved' | 'rejected') => {
    if (decision === 'approved') {
      const ok = await notify.confirm({
        title: t(
          `Выполнить «${item.summary.slice(0, 80)}»?`,
          `«${item.summary.slice(0, 80)}» bajarilsinmi?`,
        ),
        detail: t(
          'Действие произойдёт по-настоящему: бот сделает то, о чём спрашивает.',
          'Amal haqiqatdan ham bajariladi.',
        ),
        confirmText: t('Выполнить', 'Bajarish'),
        danger: true,
      });
      if (!ok) return;
    }

    setBusyId(item.id);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: item.id, decision }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setNotice({
          tone: data?.already ? 'warning' : 'error',
          text: data?.error || t('Не удалось передать решение', "Qaror yuborilmadi"),
        });
        return;
      }

      setNotice({
        tone: data?.acted ? 'success' : 'warning',
        text:
          decision === 'rejected'
            ? t('Отклонено. Ничего не изменилось.', 'Rad etildi.')
            : data?.acted
              ? t(`Выполнено. ${data?.message ?? ''}`.trim(), `Bajarildi. ${data?.message ?? ''}`.trim())
              : t(
                  `Одобрено, но не выполнено: ${data?.message ?? ''}`.trim(),
                  `Tasdiqlandi, lekin bajarilmadi: ${data?.message ?? ''}`.trim(),
                ),
      });
    } catch {
      setNotice({ tone: 'error', text: t('Нет связи с сервером', "Server bilan aloqa yo'q") });
    } finally {
      setBusyId(null);
      await refetch();
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

      {notice && <AdminNotice tone={notice.tone}>{notice.text}</AdminNotice>}

      <div className="card" style={{ padding: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        {t(
          'Решение принимается здесь или кнопками в Telegram — одно и то же действие выполнится ровно раз. «Снять» убирает заявку из очереди, НЕ выполняя её.',
          'Qaror shu yerda yoki Telegramda qabul qilinadi — amal bir marta bajariladi.',
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
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Решение принимается здесь же. Раньше кнопка была
                        только в Telegram, и без телефона работа стояла. */}
                    <button className="btn btn-sm btn-primary" style={{ minHeight: 36 }}
                      disabled={busyId === item.id} onClick={() => decide(item, 'approved')}>
                      <Check size={14} /> {t('Выполнить', 'Bajarish')}
                    </button>
                    <button className="btn btn-sm btn-ghost" style={{ minHeight: 36 }}
                      disabled={busyId === item.id} onClick={() => decide(item, 'rejected')}>
                      <X size={14} /> {t('Отклонить', 'Rad etish')}
                    </button>
                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--text-muted)', minHeight: 36 }}
                      disabled={busyId === item.id} onClick={() => drop(item)}
                      title={t('Снять из очереди, не выполняя', 'Bajarmasdan navbatdan olish')}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
