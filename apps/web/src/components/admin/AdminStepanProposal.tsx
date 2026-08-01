'use client';

import { ArrowRight, CheckCircle2, ShieldAlert, X } from 'lucide-react';

export interface Proposal {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  before?: string;
  after?: string;
  risky?: boolean;
  token: string;
}

export function AdminStepanProposal({
  proposal,
  result,
  onConfirm,
  onReject,
  lang = 'ru',
}: {
  proposal: Proposal;
  result?: { ok: boolean; text: string };
  onConfirm: () => void;
  onReject: () => void;
  lang?: 'ru' | 'uz';
}) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  return (
    <div
      className="card"
      style={{
        padding: 'var(--space-4)',
        borderRadius: 14,
        maxWidth: '85%',
        borderLeft: `3px solid ${proposal.risky ? 'var(--warning)' : 'var(--brand-primary)'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {proposal.risky ? (
          <ShieldAlert size={16} style={{ color: 'var(--warning)' }} />
        ) : (
          <CheckCircle2 size={16} style={{ color: 'var(--brand-primary)' }} />
        )}
        <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{proposal.summary}</span>
      </div>

      {(proposal.before || proposal.after) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            padding: '8px 10px',
            borderRadius: 10,
            background: 'var(--bg-secondary)',
            fontSize: 'var(--text-sm)',
            marginBottom: 10,
          }}
        >
          {proposal.before && (
            <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>
              {proposal.before}
            </span>
          )}
          {proposal.before && proposal.after && (
            <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
          )}
          {proposal.after && (
            <span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{proposal.after}</span>
          )}
        </div>
      )}

      {proposal.risky && !result && (
        <p style={{ fontSize: '11px', color: 'var(--warning)', marginBottom: 8 }}>
          {t('Это увидят клиенты сразу после подтверждения.', "Bu mijozlarga darhol ko'rinadi.")}
        </p>
      )}

      {result ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: result.ok ? 'var(--success)' : 'var(--text-muted)',
          }}
        >
          {result.ok ? <CheckCircle2 size={15} /> : <X size={15} />} {result.text}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onConfirm} className="btn btn-primary btn-sm">
            {t('Выполнить', 'Bajarish')}
          </button>
          <button onClick={onReject} className="btn btn-ghost btn-sm">
            {t('Отклонить', 'Rad etish')}
          </button>
        </div>
      )}
    </div>
  );
}
