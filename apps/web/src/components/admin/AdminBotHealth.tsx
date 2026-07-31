'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, Clock, Pause, Play, RefreshCw, Server,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Здоровье ботов и их расписания.
//
// Пульс ботов лежал в Redis и был виден только в Telegram у Стёпана да
// на служебной странице /health/bots в ИИ-офисе. Владелец в админке не
// знал, работает ли ИИ-контур вообще.
//
// Расписания (45 задач) были зашиты в Python — здесь их можно двигать и
// выключать, боты подхватывают изменения без перезапуска.
// ══════════════════════════════════════════════════════════════════════

interface Bot {
  name: string; title: string; container: string; port: number | null;
  department: string | null; telegram: boolean;
  alive: boolean; last_seen_ago: number; errors: number; last_error: string;
}

interface Job {
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

export function AdminBotHealth({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  const [bots, setBots] = useState<Bot[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingJob, setSavingJob] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [botsRes, jobsRes] = await Promise.all([
        fetch('/api/admin/bots', { credentials: 'same-origin' }),
        fetch('/api/admin/bot-jobs', { credentials: 'same-origin' }),
      ]);
      const botsData = await botsRes.json();
      const jobsData = await jobsRes.json();

      if (botsData.status === 'ok') setBots(botsData.bots ?? []);
      else setError(botsData.error || t('ИИ-офис недоступен', 'AI ofis mavjud emas'));

      // Отказ чтения расписаний раньше проваливался в тишину: ветки else не
      // было, и пустой список выглядел как «задач нет». Теперь причина видна.
      if (jobsData.status === 'ok') setJobs(jobsData.jobs ?? []);
      else setError(jobsData.error || t('Расписания не загрузились', 'Jadvallar yuklanmadi'));
    } catch {
      setError(t('Ошибка сети', 'Tarmoq xatosi'));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    load();
    // Пульс живёт 5 минут, обновляться чаще раза в 30 секунд смысла нет.
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const patchJob = async (job: Job, patch: Record<string, unknown>) => {
    const key = `${job.bot}:${job.name}`;
    setSavingJob(key);
    try {
      const res = await fetch('/api/admin/bot-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ bot: job.bot, name: job.name, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('Не удалось изменить', "O'zgartirib bo'lmadi"));
      } else {
        await load();
      }
    } catch {
      setError(t('Ошибка сети', 'Tarmoq xatosi'));
    } finally {
      setSavingJob(null);
    }
  };

  const alive = bots.filter(b => b.alive).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{
          padding: '8px 14px', borderRadius: 12, fontWeight: 700,
          background: alive === bots.length && bots.length ? 'var(--success-bg)' : 'var(--warning-bg)',
          color: alive === bots.length && bots.length ? 'var(--success)' : 'var(--warning)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Activity size={16} /> {alive}/{bots.length} {t('онлайн', 'onlayn')}
        </div>
        <button onClick={load} className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> {t('Обновить', 'Yangilash')}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, background: 'var(--error-bg)',
          color: 'var(--error)', fontSize: 'var(--text-sm)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {loading && !bots.length && (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-6)' }}>
          {t('Загрузка…', 'Yuklanmoqda…')}
        </div>
      )}

      {/* Карточки ботов */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
        {bots.map(bot => {
          const botJobs = jobs.filter(j => j.bot === bot.name);
          const isOpen = expanded === bot.name;
          return (
            <div key={bot.name} className="card" style={{
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

              {botJobs.length > 0 && (
                <button
                  onClick={() => setExpanded(isOpen ? null : bot.name)}
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: 10, width: '100%', fontSize: '11px' }}>
                  {isOpen
                    ? t('Скрыть задачи', 'Vazifalarni yashirish')
                    : t(`Задачи (${botJobs.length})`, `Vazifalar (${botJobs.length})`)}
                </button>
              )}

              {isOpen && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {botJobs.map(job => {
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
                            onClick={() => patchJob(job, { enabled: !job.enabled })}
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
                                if (h !== job.hour) patchJob(job, { hour: h });
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
                                if (m !== job.minute) patchJob(job, { minute: m });
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
        })}
      </div>

      {!loading && !bots.length && !error && (
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Server size={28} style={{ marginBottom: 8 }} />
          <div>{t('Боты не найдены', 'Botlar topilmadi')}</div>
        </div>
      )}
    </div>
  );
}
