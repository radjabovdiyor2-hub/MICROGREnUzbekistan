'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Eye, EyeOff, Play, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { AdminMagazineBrief } from './AdminMagazineBrief';
import { AdminNotice } from './AdminNotice';
import { useFeedback } from './AdminFeedback';
import { AdminMagazineIssues } from './AdminMagazineIssues';

// ══════════════════════════════════════════════════════════════════════
// Выпуски FRESH WEEKLY — то, чем журнал не управлялся вовсе.
//
// ЧЕГО НЕ БЫЛО. Восемь групп API журнала (`editions`, `issues`,
// `advertisers`, `subscriptions`, `print-orders`, `leads`, `ai-draft`,
// `brief`) не имели ни одного экрана. Выпуск нельзя было ни создать, ни
// открыть, ни опубликовать из веба: всё это делали три задачи по
// расписанию, а владелец узнавал результат по факту — из готового PDF.
//
// Вкладка «Журнал» при этом существовала и работала с ОДНИМ рестораном:
// брала первый из списка, а если список пуст — молча заводила «Fresh
// Weekly». То есть управление блюдами было, а управления журналом не было.
//
// ЧТО ЗДЕСЬ. Список выпусков с числом персональных номеров, публикация в
// одно нажатие и ручной запуск того же крона, что работает по расписанию, —
// чтобы «подготовить следующий выпуск» не означало ждать вторника.
// ══════════════════════════════════════════════════════════════════════

interface Edition {
  id: string;
  weekNumber: number;
  title: string;
  coverTheme: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  _count?: { issues: number };
}

const CRONS = [
  {
    id: 'prepare',
    label: 'Подготовить следующий',
    hint: 'Создаёт выпуск недели и черновик для каждого ресторана-партнёра. Повторный запуск безопасен: существующие черновики не трогает.',
  },
  {
    id: 'finalize',
    label: 'Опубликовать выпуск',
    hint: 'Публикует выпуск и переводит все черновики в «готов».',
  },
  {
    id: 'print-run',
    label: 'Посчитать тираж',
    hint: 'По активным подпискам выставляет счета на печать. Уже выставленные не дублирует.',
  },
];

export function AdminMagazineEditions({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const queryClient = useQueryClient();
  const notify = useFeedback();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [openEdition, setOpenEdition] = useState<Edition | null>(null);

  const { data: editions = [], isPending } = useQuery<Edition[]>({
    queryKey: ['admin-magazine-editions'],
    queryFn: async () => {
      const res = await fetch('/api/admin/magazine/editions', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Не удалось загрузить выпуски');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const reload = () => queryClient.invalidateQueries({ queryKey: ['admin-magazine-editions'] });

  const runCron = async (id: string) => {
    const cron = CRONS.find((c) => c.id === id);
    const ok = await notify.confirm({
      title: `${cron?.label}?`,
      detail: cron?.hint ?? '',
      confirmText: t('Запустить', 'Ishga tushirish'),
    });
    if (!ok) return;

    setBusy(id);
    setError('');
    try {
      const res = await fetch(`/api/admin/magazine/cron/${id}`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не получилось');
      notify.success(summarize(id, data));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    } finally {
      setBusy('');
    }
  };

  const togglePublish = async (edition: Edition) => {
    setBusy(edition.id);
    setError('');
    try {
      const res = await fetch('/api/admin/magazine/editions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: edition.id, isPublished: !edition.isPublished }),
      });
      if (!res.ok) throw new Error('Не удалось изменить выпуск');
      notify.success(edition.isPublished
        ? t('Выпуск снят с публикации', 'Son eʼlondan olindi')
        : t('Выпуск опубликован', 'Son eʼlon qilindi'));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    } finally {
      setBusy('');
    }
  };

  if (openEdition) {
    return (
      <AdminMagazineIssues
        editionId={openEdition.id}
        title={`#${openEdition.weekNumber} · ${openEdition.title}`}
        onBack={() => setOpenEdition(null)}
        lang={lang}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookOpen size={24} /> {t('Выпуски журнала', 'Jurnal sonlari')}
        </h2>
        <button className="btn btn-ghost btn-sm" onClick={reload}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> {t('Обновить', 'Yangilash')}
        </button>
      </div>

      <AdminNotice>{error}</AdminNotice>

      {/* Сводка недели стоит ПЕРЕД конвейером: её читают, чтобы решить, о
          чём номер, а конвейер этот номер уже собирает. */}
      <AdminMagazineBrief lang={lang} />

      {/* Те же три задачи, что работают по расписанию. Запуск руками нужен
          не вместо расписания, а рядом: «подготовить следующий» не должно
          означать «дождаться вторника». */}
      <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
          {t('Конвейер выпуска', 'Son konveyeri')}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {CRONS.map((c) => (
            <button key={c.id} className="btn btn-sm" disabled={Boolean(busy)}
              onClick={() => runCron(c.id)} title={c.hint}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Play size={14} /> {busy === c.id ? '…' : c.label}
            </button>
          ))}
        </div>
      </div>

      {isPending && <div style={{ color: 'var(--text-muted)' }}>{t('Загрузка…', 'Yuklanmoqda…')}</div>}

      {!isPending && editions.length === 0 && (
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
          {t('Выпусков нет. Нажмите «Подготовить следующий».', 'Sonlar yoʻq. «Keyingisini tayyorlash» ni bosing.')}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {editions.map((e) => (
          <div key={e.id} className="card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <button onClick={() => setOpenEdition(e)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)' }}>
                <div style={{ fontWeight: 'var(--font-bold)' }}>#{e.weekNumber} · {e.title}</div>
              </button>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                {e.coverTheme || t('без темы', 'mavzusiz')}
                {' · '}
                {t(`ресторанов: ${e._count?.issues ?? 0}`, `restoranlar: ${e._count?.issues ?? 0}`)}
              </div>
            </div>

            <span style={{
              padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 'bold',
              background: e.isPublished ? 'var(--success-bg)' : 'var(--bg-secondary)',
              color: e.isPublished ? 'var(--success)' : 'var(--text-muted)',
            }}>
              {e.isPublished ? t('опубликован', 'eʼlon qilingan') : t('черновик', 'qoralama')}
            </span>

            <button className="btn btn-sm" disabled={busy === e.id} onClick={() => togglePublish(e)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {e.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}
              {e.isPublished ? t('Снять', 'Olib qoʻyish') : t('Опубликовать', 'Eʼlon qilish')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Человеческий итог прогона: числа, а не «готово». */
function summarize(id: string, data: Record<string, unknown>): string {
  if (id === 'prepare') return `Выпуск №${data.edition}, новых черновиков: ${data.createdIssues ?? 0}`;
  if (id === 'print-run') return `Счетов на печать: ${data.ordersCreated ?? 0}`;
  return 'Готово';
}
