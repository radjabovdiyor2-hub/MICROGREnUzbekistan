'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminClient';

// «Брифинг недели» — темы, новости, статистика от ботов/ИИ. Владелец копирует в слоты.

interface Brief {
  season: string;
  weather: string;
  news: string[];
  googleTrends: string[];
  topics: Record<string, string>;
  stats: { topMicrogreens: { name: string; count: number }[]; topProducts: string[]; partnerCount: number; restaurantsTotal: number };
}

const TOPIC_LABELS: Record<string, string> = {
  health: '👨 Здоровье (муж.)', beauty: '👩 Бьюти (жен.)', recipe: '🍽 Рецепт', tech: '💻 Tech', news: '📰 Новость', kids: '🧒 Дети',
};

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); } catch { /* ignore */ }
  };
  return (
    <button onClick={copy} title="Скопировать" style={{ background: ok ? 'var(--success)' : 'var(--bg-secondary)', color: ok ? '#fff' : 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px 10px', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 600, flexShrink: 0 }}>
      {ok ? '✓ Скопировано' : '📋 Копировать'}
    </button>
  );
}

export function BriefTab() {
  const [data, setData] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData(await (await adminFetch('/api/admin/magazine/brief')).json()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ padding: 'var(--space-4)' }}>Собираю брифинг (тренды, новости, статистика)…</div>;
  if (!data) return <div style={{ padding: 'var(--space-4)' }}>Не удалось загрузить. <button onClick={load}>Повторить</button></div>;

  const card: React.CSSProperties = { padding: 'var(--space-4)', marginBottom: 'var(--space-4)' };
  const row: React.CSSProperties = { display: 'flex', gap: 'var(--space-2)', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color)' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Сезон: {data.season}{data.weather ? ` · ${data.weather}` : ''}</div>
        <button onClick={load} style={{ background: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer' }}>↻ Обновить</button>
      </div>

      {/* Темы недели */}
      <div className="card" style={card}>
        <h3 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)' }}>🔥 Темы недели</h3>
        {data.googleTrends.length > 0 && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>Google Trends UZ:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {data.googleTrends.map((t, i) => (
                <span key={i} onClick={() => navigator.clipboard.writeText(t)} title="Скопировать" style={{ background: 'var(--bg-secondary)', borderRadius: '20px', padding: '3px 12px', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>{t}</span>
              ))}
            </div>
          </div>
        )}
        {Object.keys(data.topics).length > 0 ? (
          Object.entries(data.topics).map(([k, v]) => (
            <div key={k} style={row}>
              <div><span style={{ fontWeight: 700, marginRight: 8 }}>{TOPIC_LABELS[k] || k}</span>{v}</div>
              <CopyBtn text={v} />
            </div>
          ))
        ) : <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Идеи тем появятся при настроенном GEMINI_API_KEY.</div>}
      </div>

      {/* Новости */}
      <div className="card" style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
          <h3 style={{ fontWeight: 'var(--font-bold)' }}>📰 Новости недели</h3>
          {data.news.length > 0 && <CopyBtn text={data.news.map((n) => `• ${n}`).join('\n')} />}
        </div>
        {data.news.length > 0 ? data.news.map((n, i) => (
          <div key={i} style={row}><span>{n}</span><CopyBtn text={n} /></div>
        )) : <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>RSS недоступен.</div>}
      </div>

      {/* Статистика */}
      <div className="card" style={card}>
        <h3 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)' }}>📊 Статистика / Аналитика</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <Stat label="Партнёров" value={data.stats.partnerCount} />
          <Stat label="Ресторанов в базе" value={data.stats.restaurantsTotal} />
        </div>
        {data.stats.topMicrogreens.length > 0 && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '6px' }}>Топ-микрозелень (по базе ресторанов):</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {data.stats.topMicrogreens.map((m) => (
                <span key={m.name} style={{ background: 'var(--bg-secondary)', borderRadius: '20px', padding: '3px 12px', fontSize: 'var(--text-sm)' }}>{m.name} · {m.count}</span>
              ))}
            </div>
          </div>
        )}
        {data.stats.topProducts.length > 0 && (
          <div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '6px' }}>Топ-продукты магазина:</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{data.stats.topProducts.join(' · ')}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', textAlign: 'center' }}>
      <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--brand-primary)' }}>{value}</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}
