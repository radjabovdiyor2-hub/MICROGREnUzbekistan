'use client';

import React from 'react';
import { Clock, Pause, Play } from 'lucide-react';

export interface Bot {
  name: string; title: string; container: string; port: number | null;
  department: string | null; telegram: boolean;
  alive: boolean; last_seen_ago: number; errors: number; last_error: string;
}

export interface Job {
  bot: string; name: string; kind: string;
  hour: number | null; minute: number | null;
  dayOfWeek: number | null; dayOfMonth: number | null; seconds: number | null;
  enabled: boolean;
  lastRunAt: string | null; lastStatus: string | null; lastError: string | null;
}

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function describeSchedule(j: Job): string {
  if (j.kind === 'interval') {
    const s = j.seconds ?? 0;
    if (s >= 3600) return `каждые ${Math.round(s / 3600)} ч`;
    if (s >= 60) return `каждые ${Math.round(s / 60)} мин`;
    return `каждые ${s} с`;
  }
  const time = `${String(j.hour ?? 0).padStart(2, '0')}:${String(j.minute ?? 0).padStart(2, '0')}`;
  if (j.dayOfWeek != null) return `${DAYS[j.dayOfWeek] ?? '?'} в ${time}`;
  if (j.dayOfMonth != null) return `${j.dayOfMonth}-го в ${time}`;
  return `ежедневно в ${time}`;
}

export function AdminBotCard({
  bot,
  jobs,
  isOpen,
  savingJob,
  t,
  onToggleExpanded,
  onPatchJob,
}: {
  bot: Bot;
  jobs: Job[];
  isOpen: boolean;
  savingJob: string | null;
  t: (ru: string, uz: string) => string;
  onToggleExpanded: () => void;
  onPatchJob: (job: Job, patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="card" style={{
      padding: 'var(--space-4)', borderRadius: 14,
      borderLeft: `3px solid ${bot.alive ? 'var(--success)' : 'var(--error)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: bot.alive ? 'var(--success)' : 'var(--error)',
        }} />
        <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{bot.title}</span>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 8 }}>
        {bot.container}{bot.port ? `:${bot.port}` : ''}
      </div>

      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
        {bot.alive
          ? t(`Пульс ${bot.last_seen_ago} с назад`, `Puls ${bot.last_seen_ago} s oldin`)
          : bot.last_seen_ago < 0
            ? t('Не запущен', 'Ishga tushmagan')
            : t(`Оффлайн ${Math.round(bot.last_seen_ago / 60)} мин`, `Oflayn ${Math.round(bot.last_seen_ago / 60)} daq`)}
      </div>

      {bot.errors > 0 && (
        <div style={{ fontSize: '11px', color: 'var(--warning)', marginTop: 6 }}>
          ⚠ {bot.errors} {t('ошибок', 'xato')}
          {bot.last_error && (
            <div style={{ color: 'var(--text-muted)', marginTop: 2, wordBreak: 'break-word' }}>
              {bot.last_error.slice(0, 120)}
            </div>
          )}
        </div>
      )}

      {jobs.length > 0 && (
        <button
          onClick={onToggleExpanded}
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 10, width: '100%', fontSize: '11px' }}>
          {isOpen
            ? t('Скрыть задачи', 'Vazifalarni yashirish')
            : t(`Задачи (${jobs.length})`, `Vazifalar (${jobs.length})`)}
        </button>
      )}

      {isOpen && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {jobs.map(job => {
            const key = `${job.bot}:${job.name}`;
            const busy = savingJob === key;
            return (
              <div key={key} style={{
                padding: 8, borderRadius: 10, background: 'var(--bg-secondary)',
                opacity: job.enabled ? 1 : 0.55,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {job.name}
                  </span>
                  <button
                    onClick={() => onPatchJob(job, { enabled: !job.enabled })}
                    disabled={busy}
                    title={job.enabled ? t('Выключить', "O'chirish") : t('Включить', 'Yoqish')}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
                      color: job.enabled ? 'var(--success)' : 'var(--text-muted)',
                    }}>
                    {busy ? <Clock size={14} /> : job.enabled ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4 }}>
                  {describeSchedule(job)}
                </div>

                {job.kind === 'cron' && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
                    <input
                      type="number" min={0} max={23} defaultValue={job.hour ?? 0}
                      onBlur={e => {
                        const h = Number(e.target.value);
                        if (h !== job.hour) onPatchJob(job, { hour: h });
                      }}
                      style={{
                        width: 46, padding: '3px 5px', fontSize: '11px', borderRadius: 6,
                        border: '1px solid var(--border)', background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                      }} />
                    <span style={{ fontSize: 11 }}>:</span>
                    <input
                      type="number" min={0} max={59} defaultValue={job.minute ?? 0}
                      onBlur={e => {
                        const m = Number(e.target.value);
                        if (m !== job.minute) onPatchJob(job, { minute: m });
                      }}
                      style={{
                        width: 46, padding: '3px 5px', fontSize: '11px', borderRadius: 6,
                        border: '1px solid var(--border)', background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                      }} />
                  </div>
                )}

                {job.lastRunAt && (
                  <div style={{
                    fontSize: '10px', marginTop: 5,
                    color: job.lastStatus === 'error' ? 'var(--error)' : 'var(--text-muted)',
                  }}>
                    {t('Последний запуск', 'Oxirgi ishga tushish')}:{' '}
                    {new Date(job.lastRunAt).toLocaleString('ru-RU')}
                    {job.lastStatus === 'error' && ` — ${t('ошибка', 'xato')}`}
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
