'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, RefreshCw, Server } from 'lucide-react';
import { AdminBotCard, type Bot, type Job } from './AdminBotCard';

export function AdminBotHealth({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

    const [localError, setLocalError] = useState('');
  const [savingJob, setSavingJob] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading: loading, error, refetch: load } = useQuery<{bots: Bot[], jobs: Job[]}, Error>({
    queryKey: ['admin-bot-health'],
    queryFn: async () => {
      const [botsRes, jobsRes] = await Promise.all([
        fetch('/api/admin/bots', { credentials: 'same-origin' }),
        fetch('/api/admin/bot-jobs', { credentials: 'same-origin' }),
      ]);
      const botsData = await botsRes.json();
      const jobsData = await jobsRes.json();

      let err = '';
      if (botsData.status !== 'ok') err = botsData.error || t('ИИ-офис недоступен', 'AI ofis mavjud emas');
      if (jobsData.status !== 'ok') err = jobsData.error || t('Расписания не загрузились', 'Jadvallar yuklanmadi');

      if (err) throw new Error(err);
      return { bots: botsData.bots ?? [], jobs: jobsData.jobs ?? [] };
    },
    // Две минуты вместо тридцати секунд: за каждым тиком стоит межсервисный
    // хоп в FastAPI офиса и тринадцать HGETALL в Redis (`shared/health.py`),
    // причём с новым клиентом Redis на каждый вызов.
    refetchInterval: 120_000,
  });

  const bots = data?.bots || [];
  const jobs = data?.jobs || [];

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
        setLocalError(data.error || t('Не удалось изменить', "O'zgartirib bo'lmadi"));
      } else {
        await load();
      }
    } catch {
      setLocalError(t('Ошибка сети', 'Tarmoq xatosi'));
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
        <button onClick={() => load()} className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> {t('Обновить', 'Yangilash')}
        </button>
      </div>

      {(error || localError) && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, background: 'var(--error-bg)',
          color: 'var(--error)', fontSize: 'var(--text-sm)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={16} /> {error?.message || localError}
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

      {!loading && !bots.length && !error && !localError && (
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Server size={28} style={{ marginBottom: 8 }} />
          <div>{t('Боты не найдены', 'Botlar topilmadi')}</div>
        </div>
      )}
    </div>
  );
}
