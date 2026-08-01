'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw, Server } from 'lucide-react';
import { AdminBotCard, type Bot, type Job } from './AdminBotCard';

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
        {bots.map(bot => {
          const botJobs = jobs.filter(j => j.bot === bot.name);
          const isOpen = expanded === bot.name;
          return (
            <AdminBotCard
              key={bot.name}
              bot={bot}
              jobs={botJobs}
              isOpen={isOpen}
              savingJob={savingJob}
              t={t}
              onToggleExpanded={() => setExpanded(isOpen ? null : bot.name)}
              onPatchJob={patchJob}
            />
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
