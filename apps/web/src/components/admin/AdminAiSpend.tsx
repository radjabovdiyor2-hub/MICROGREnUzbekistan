'use client';

import { useQuery } from '@tanstack/react-query';
import { Cpu, DollarSign, TrendingUp } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Расходы на ИИ.
//
// Таблица ai_usage писалась всегда, но показать её было негде: бюджеты
// AI_DAILY_BUDGET_USD / AI_MONTHLY_BUDGET_USD задавались в .env и
// работали лишь как порог для алерта в Telegram. Сколько съел каждый из
// 13 ботов, владелец не знал.
// ══════════════════════════════════════════════════════════════════════

interface Budget {
  dailyUsd: number; monthlyUsd: number; todayUsd: number; monthUsd: number;
  todayPct: number; monthPct: number; monthUzs: number;
}

interface BotSpend { bot: string; costUsd: number; inputTokens: number; outputTokens: number; calls: number }

const usd = (n: number) => `$${n.toFixed(2)}`;

export function AdminAiSpend({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  const { data: spend, isPending: loading } = useQuery<{ budget: Budget | null; byBot: BotSpend[] }>({
    queryKey: ['admin-ai-spend'],
    queryFn: async () => {
      const res = await fetch('/api/admin/ai-usage?days=30', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Не удалось загрузить расход ИИ');
      const data = await res.json();
      // Сервер отвечает 200 и со `status: 'error'` — раньше такой ответ
      // просто оставлял экран пустым, без объяснения.
      if (data.status !== 'ok') throw new Error(data.error || 'ИИ-расход недоступен');
      return { budget: data.budget ?? null, byBot: data.byBot ?? [] };
    },
  });
  const budget = spend?.budget ?? null;
  const byBot = spend?.byBot ?? [];

  if (loading) {
    return <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-6)' }}>
      {t('Загрузка…', 'Yuklanmoqda…')}
    </div>;
  }

  const maxSpend = Math.max(...byBot.map(b => b.costUsd), 0.0001);

  const bar = (pct: number) =>
    pct >= 100 ? 'var(--error)' : pct >= 80 ? 'var(--warning)' : 'var(--success)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {budget && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
          {[
            { label: t('Сегодня', 'Bugun'), spent: budget.todayUsd, cap: budget.dailyUsd, pct: budget.todayPct },
            { label: t('За месяц', 'Bu oyda'), spent: budget.monthUsd, cap: budget.monthlyUsd, pct: budget.monthPct },
          ].map(b => (
            <div key={b.label} className="card" style={{ padding: 'var(--space-4)', borderRadius: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <DollarSign size={16} style={{ color: bar(b.pct) }} />
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {b.label}
                </span>
              </div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>
                {usd(b.spent)} <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontWeight: 400 }}>
                  / {usd(b.cap)}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', marginTop: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(b.pct, 100)}%`, background: bar(b.pct), transition: 'width .3s' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {b.pct}% {t('бюджета', 'byudjet')}
              </div>
            </div>
          ))}

          <div className="card" style={{ padding: 'var(--space-4)', borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <TrendingUp size={16} style={{ color: 'var(--brand-primary)' }} />
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Месяц в сумах', 'Oylik so\'mda')}
              </span>
            </div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>
              {budget.monthUzs.toLocaleString('ru-RU').replace(/,/g, ' ')} сум
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {t('по курсу из настроек', 'sozlamalardagi kurs bo\'yicha')}
            </div>
          </div>
        </div>
      )}

      {/* Бюджет — сигнал, а не стоп-кран: боты продолжают работать при превышении. */}
      {budget && budget.monthPct >= 80 && (
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: budget.monthPct >= 100 ? 'var(--error-bg)' : 'var(--warning-bg)',
          color: budget.monthPct >= 100 ? 'var(--error)' : 'var(--warning)',
          fontSize: 'var(--text-sm)', fontWeight: 600,
        }}>
          {budget.monthPct >= 100
            ? t('Месячный бюджет превышен. Боты продолжают работать — это предупреждение, а не блокировка.',
                'Oylik byudjet oshib ketdi. Botlar ishlashda davom etmoqda.')
            : t('Израсходовано более 80% месячного бюджета ИИ.',
                'Oylik AI byudjetining 80% dan ortig\'i sarflandi.')}
        </div>
      )}

      <div className="card" style={{ padding: 'var(--space-4)', borderRadius: 14 }}>
        <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Cpu size={16} /> {t('По ботам за 30 дней', '30 kunda botlar bo\'yicha')}
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {byBot.map(b => (
            <div key={b.bot}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', marginBottom: 3 }}>
                <span>{b.bot}</span>
                <b>{usd(b.costUsd)}</b>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${(b.costUsd / maxSpend) * 100}%`,
                  background: 'var(--brand-primary)',
                }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {b.calls} {t('вызовов', 'chaqiruv')} · {(b.inputTokens + b.outputTokens).toLocaleString('ru-RU')} {t('токенов', 'token')}
              </div>
            </div>
          ))}

          {!byBot.length && (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-4)' }}>
              {t('Расходов пока нет', 'Hozircha xarajatlar yo\'q')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
