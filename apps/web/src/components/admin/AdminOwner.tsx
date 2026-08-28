'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AREA_LABELS, PRACTICE_AREAS, type PracticeArea, type Rhythm } from '@/lib/owner/practices';
import { AdminOwnerSummary } from './AdminOwnerSummary';
import { AdminPracticeRow } from './AdminPracticeRow';

// ══════════════════════════════════════════════════════════════════════
// Экран владельца: жизнь и дело под одним контролем.
//
// Три четверти советов из разбора канала — про человека, а не про код:
// приоритеты, состояние, личные деньги, решения, команда. Прочитанная и
// незаведённая практика ничем не отличается от непрочитанной.
//
// СНАЧАЛА «СЕГОДНЯ», ПОТОМ ВСЁ ОСТАЛЬНОЕ. Открывая экран утром, владелец
// хочет знать, что не сделано, а не изучать каталог из 279 строк.
// Правила вынесены вниз и в отдельный список: их не отмечают.
// ══════════════════════════════════════════════════════════════════════

interface View {
  key: string;
  title: string;
  why: string;
  rhythm: Rhythm;
  custom: boolean;
  area: string;
  videos: string[];
  status: string;
  note: string | null;
  progress: { streak: number; due: boolean; lastDone: string | null; total: number };
}

const KEY = ['admin-owner-practices'];

export function AdminOwner({ lang }: { lang: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'uz' ? uz : ru);
  const qc = useQueryClient();
  const [area, setArea] = useState<PracticeArea>('time');

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch('/api/admin/owner', { credentials: 'same-origin' });
      const json = await res.json();
      if (json.status === 'ok') return json.practices as View[];
      throw new Error(json.error || 'Не удалось загрузить');
    },
  });

  const reload = () => qc.invalidateQueries({ queryKey: KEY });

  const tick = useMutation({
    mutationFn: async (v: { key: string; done: boolean }) => {
      const res = await fetch('/api/admin/owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: () => void reload(),
  });

  const state = useMutation({
    mutationFn: async (v: { key: string; status?: string; rhythm?: string; note?: string }) => {
      const res = await fetch('/api/admin/owner', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: () => void reload(),
  });

  const onTick = (key: string, done: boolean) => tick.mutate({ key, done });
  const onState = (key: string, patch: { status?: string; rhythm?: string; note?: string }) =>
    state.mutate({ key, ...patch });

  if (isLoading) {
    return <div style={{ padding: 'var(--space-4)' }}>{t('Загрузка…', 'Yuklanmoqda…')}</div>;
  }

  const all = data ?? [];
  const dueNow = all.filter(
    (p) => p.rhythm !== 'principle' && p.status !== 'paused' && p.progress.due,
  );
  const inArea = all.filter((p) => p.area === area);
  const rituals = inArea.filter((p) => p.rhythm !== 'principle');
  const rules = inArea.filter((p) => p.rhythm === 'principle');

  const block = (title: string, hint: string, rows: View[]) =>
    rows.length === 0 ? null : (
      <div className="card" style={{ padding: 'var(--space-4)', borderRadius: 14, marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>{title}</div>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            marginBottom: 4,
            lineHeight: 1.4,
          }}
        >
          {hint}
        </div>
        {rows.map((p) => (
          <AdminPracticeRow key={p.key} practice={p} lang={lang} onTick={onTick} onState={onState} />
        ))}
      </div>
    );

  return (
    <div>
      <AdminOwnerSummary practices={all} lang={lang} />

      {block(
        t('Сегодня', 'Bugun'),
        t('По ритму подошло и ещё не отмечено.', 'Ritmi keldi va belgilanmagan.'),
        dueNow,
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
        {PRACTICE_AREAS.map((a) => (
          <button
            key={a}
            type="button"
            className={`btn btn-sm ${a === area ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setArea(a)}
          >
            {AREA_LABELS[a][lang]}
          </button>
        ))}
      </div>

      {block(
        t('Ритуалы', 'Ritual'),
        t(
          'Повторяются. Ритм — предположение: поменяйте под себя, ваша неделя виднее.',
          'Takrorlanadi. Ritm — taxmin: o‘zingizga moslang.',
        ),
        rituals,
      )}

      {block(
        t('Правила', 'Qoidalar'),
        t(
          'Не отмечаются — помнятся. Галочка на правиле дала бы список, который не выполняется ни в один день.',
          'Belgilanmaydi — eslab qolinadi.',
        ),
        rules,
      )}
    </div>
  );
}
