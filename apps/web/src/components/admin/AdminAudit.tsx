'use client';

import { useCallback, useEffect, useState } from 'react';
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

  const [entries, setEntries] = useState<Entry[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (append = false, from: string | null = null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ take: '80' });
      if (q.trim()) params.set('q', q.trim());
      if (from) params.set('cursor', from);

      const res = await fetch(`/api/admin/audit?${params}`, { credentials: 'same-origin' });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setError(null);
        setEntries(prev => (append ? [...prev, ...data.entries] : data.entries));
        setCursor(data.nextCursor);
      } else {
        setError(data.error || t('Ошибка при загрузке журнала аудита', 'Audit jurnalini yuklashda xatolik'));
      }
    } catch {
      setError(t('Ошибка при загрузке журнала аудита', 'Audit jurnalini yuklashda xatolik'));
    } finally {
      setLoading(false);
    }
  }, [q, t]);

  useEffect(() => {
    // Небольшая задержка, чтобы не дёргать сервер на каждую букву поиска.
    const id = setTimeout(() => load(false, null), 300);
    return () => clearTimeout(id);
  }, [load]);

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
        <button onClick={() => load(true, cursor)} className="btn btn-outline">
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
