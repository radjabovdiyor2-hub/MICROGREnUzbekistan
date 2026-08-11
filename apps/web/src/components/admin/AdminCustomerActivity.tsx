'use client';

import { Bell, MessageSquare } from 'lucide-react';
import type { CustomerCard } from '@/lib/customers/card';

// Обращения клиента и запланированные напоминания.
//
// Обе таблицы (`interactions`, `followups`) ведёт AI-офис: боты пишут туда
// каждое касание, а продажи ставят follow-up после заказа. В вебе их не
// показывал ни один экран — владелец видел только то, что клиент купил, но
// не то, о чём он писал и что ему обещали.

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

const FOLLOWUP_LABELS: Record<string, string> = {
  pending: 'ожидает',
  done: 'выполнено',
  cancelled: 'отменено',
};

const row: React.CSSProperties = {
  padding: 'var(--space-2) 0',
  borderBottom: '1px solid var(--border)',
  fontSize: 'var(--text-sm)',
};

export function AdminCustomerActivity({
  interactions,
  followups,
}: {
  interactions: CustomerCard['interactions'];
  followups: CustomerCard['followups'];
}) {
  if (interactions.length === 0 && followups.length === 0) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
      {interactions.length > 0 && (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>
            <MessageSquare size={18} /> Обращения
          </h3>
          {interactions.map((i) => (
            <div key={i.id} style={row}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 'var(--font-semibold)' }}>
                  {i.type}
                  <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--font-normal)' }}>
                    {' '}· {i.channel}{i.botName ? ` · ${i.botName}` : ''}
                  </span>
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {fmtDateTime(i.createdAt)}
                </span>
              </div>
              {i.summary && (
                <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{i.summary}</div>
              )}
              {!i.resolved && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', marginTop: 2 }}>
                  не закрыто
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {followups.length > 0 && (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>
            <Bell size={18} /> Напоминания
          </h3>
          {followups.map((f) => (
            <div key={f.id} style={row}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{f.message}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {fmtDateTime(f.scheduledAt)}
                </span>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: f.status === 'pending' ? 'var(--warning)' : 'var(--text-muted)' }}>
                {FOLLOWUP_LABELS[f.status] || f.status}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
