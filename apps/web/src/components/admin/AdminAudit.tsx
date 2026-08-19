'use client';

import { useCallback, useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { AlertTriangle, Bot, History, Search, ShieldCheck, User } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Журнал действий.
//
// Записи вёл lib/audit.ts, но только в файл JSONL на сервере — прочитать
// их можно было лишь через SSH. Теперь журнал виден отсюда.
//
// Кнопки «удалить запись» здесь нет намеренно: журнал, который можно
// почистить из интерфейса, ничего не доказывает. Файл с цепочкой HMAC
// остаётся источником доказательств, эта таблица — для чтения.
// ══════════════════════════════════════════════════════════════════════

interface Entry {
  id: string; ts: string; action: string;
  actor: string | null; role: string | null; ip: string | null;
  target: string | null; meta: unknown;
}

/** Цвет по типу действия: опасное — красным, чтение — серым. */
function actionColor(action: string): string {
  if (action.startsWith('stepan.execute')) return 'var(--warning)';
  if (action.includes('delete')) return 'var(--error)';
  if (action.startsWith('login') || action.includes('password')) return 'var(--info)';
  if (action.startsWith('settings') || action.startsWith('bot.')) return 'var(--brand-primary)';
  return 'var(--text-secondary)';
}

export function AdminAudit({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = useCallback((ru: string, uz: string) => (lang === 'ru' ? ru : uz), [lang]);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Небольшая задержка, чтобы не дёргать сервер на каждую букву поиска.
  // Она теперь на ВВОДЕ: раньше стояла на самом запросе, и журнал ждал
  // 300 мс даже при первом открытии вкладки.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const failed = t('Ошибка при загрузке журнала аудита', 'Audit jurnalini yuklashda xatolik');

  const audit = useInfiniteQuery<{ entries: Entry[]; nextCursor: string | null }>({
    queryKey: ['admin-audit', debouncedQ],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ take: '80' });
      if (debouncedQ) params.set('q', debouncedQ);
      if (pageParam) params.set('cursor', String(pageParam));

      const res = await fetch(`/api/admin/audit?${params}`, { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      // Роут отвечает 200 и при отказе, отличая его полем `status`.
      if (!res.ok || data.status !== 'ok') throw new Error(data.error || failed);
      return { entries: data.entries as Entry[], nextCursor: data.nextCursor ?? null };
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  const entries = audit.data?.pages.flatMap((page) => page.entries) ?? [];
  const cursor = audit.hasNextPage ? 'more' : null;
  const loading = audit.isPending || audit.isFetchingNextPage;
  const error = audit.error instanceof Error ? audit.error.message : null;
  const load = useCallback(() => { void audit.fetchNextPage(); }, [audit]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={t('Поиск: действие, автор, объект…', 'Qidiruv: amal, muallif…')}
          style={{
            width: '100%', padding: '10px 12px 10px 34px', border: '1.5px solid var(--border)',
            borderRadius: 10, background: 'var(--bg-primary)', color: 'var(--text-primary)',
            fontSize: 'var(--text-sm)', outline: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {entries.map(e => {
          const isStepan = e.actor === 'stepan';
          const open = expanded === e.id;
          return (
            <div key={e.id} className="card" style={{ padding: '10px 14px', borderRadius: 10 }}>
              <div
                onClick={() => setExpanded(open ? null : e.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 128, fontFamily: 'monospace' }}>
                  {new Date(e.ts).toLocaleString('ru-RU')}
                </span>

                <span style={{
                  fontSize: 'var(--text-xs)', fontWeight: 700, fontFamily: 'monospace',
                  color: actionColor(e.action),
                }}>
                  {e.action}
                </span>

                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, color: isStepan ? 'var(--warning)' : 'var(--text-muted)',
                }}>
                  {isStepan ? <Bot size={12} /> : <User size={12} />}
                  {e.actor ?? '—'}
                </span>

                {e.target && (
                  <span style={{
                    fontSize: 11, color: 'var(--text-secondary)', flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {e.target}
                  </span>
                )}
              </div>

              {open && e.meta != null && (
                <pre style={{
                  marginTop: 8, padding: 10, borderRadius: 8, background: 'var(--bg-secondary)',
                  fontSize: 11, overflowX: 'auto', color: 'var(--text-secondary)',
                }}>
                  {JSON.stringify(e.meta, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-4)' }}>
          {t('Загрузка…', 'Yuklanmoqda…')}
        </div>
      )}

      {!loading && error && (
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--error)' }}>
          <AlertTriangle size={28} style={{ marginBottom: 8 }} />
          <div>{error}</div>
        </div>
      )}

      {!loading && !error && !entries.length && (
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
          <History size={28} style={{ marginBottom: 8 }} />
          <div>{t('Записей нет', 'Yozuvlar yo\'q')}</div>
        </div>
      )}

      {cursor && !loading && (
        <button onClick={load} className="btn btn-outline">
          {t('Показать ещё', 'Yana ko\'rsatish')}
        </button>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
        color: 'var(--text-muted)', padding: '8px 4px',
      }}>
        <ShieldCheck size={13} />
        {t(
          'Записи защищены от подделки цепочкой HMAC в файле журнала на сервере.',
          'Yozuvlar serverdagi jurnal faylida HMAC zanjiri bilan himoyalangan.',
        )}
      </div>
    </div>
  );
}
