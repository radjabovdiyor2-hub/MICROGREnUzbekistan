'use client';

import { useState, useEffect } from 'react';
import * as Icons from '@/components/ui/Icons';

interface ForecastItem {
  id: string;
  nameUz: string;
  stock: number;
  price: number;
  monthlySales: number[];
  forecast: number[];
  daysOfSupply: number;
  suggestedOrder: number;
  urgency: string;
  trend: string;
  category?: { nameUz: string };
}

const URGENCY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  CRITICAL: { label: 'Tezkor', color: '#EF4444', bg: '#EF444415' },
  SOON: { label: 'Tez orada', color: '#F59E0B', bg: '#F59E0B15' },
  NORMAL: { label: 'Normal', color: '#10B981', bg: '#10B98115' },
};

const TREND_ICON: Record<string, { icon: React.ReactNode; color: string }> = {
  UP: { icon: <Icons.TrendingUp size={14} />, color: '#10B981' },
  DOWN: { icon: <Icons.TrendingDown size={14} />, color: '#EF4444' },
  STABLE: { icon: <Icons.Minus size={14} />, color: 'var(--text-muted)' },
};

export function AdminForecast() {
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [urgencyFilter, setUrgencyFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/inventory/analytics?section=forecast');
        const data = await res.json();
        setForecast(data.forecast || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const filtered = urgencyFilter ? forecast.filter(f => f.urgency === urgencyFilter) : forecast;

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <Icons.Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
        <p style={{ marginTop: 'var(--space-2)' }}>Prognoz hisoblanmoqda...</p>
      </div>
    );
  }

  const criticalCount = forecast.filter(f => f.urgency === 'CRITICAL').length;
  const soonCount = forecast.filter(f => f.urgency === 'SOON').length;
  const totalSuggestedValue = forecast.reduce((s, f) => s + f.suggestedOrder * f.price, 0);
  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <div className="card" style={{ padding: 'var(--space-3)', textAlign: 'center', borderLeft: '3px solid var(--error)' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Tezkor</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-xl)', color: 'var(--error)' }}>{criticalCount}</div>
        </div>
        <div className="card" style={{ padding: 'var(--space-3)', textAlign: 'center', borderLeft: '3px solid #F59E0B' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Tez orada</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-xl)', color: '#F59E0B' }}>{soonCount}</div>
        </div>
        <div className="card" style={{ padding: 'var(--space-3)', textAlign: 'center', borderLeft: '3px solid var(--brand-primary)' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Byudjet</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-sm)', color: 'var(--brand-primary)' }}>{fmt(totalSuggestedValue)}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        {[
          { id: '', label: 'Barchasi', count: forecast.length },
          { id: 'CRITICAL', label: 'Tezkor', count: criticalCount },
          { id: 'SOON', label: 'Tez orada', count: soonCount },
        ].map(f => (
          <button key={f.id} onClick={() => setUrgencyFilter(f.id)}
            className={`btn btn-sm ${urgencyFilter === f.id ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 'var(--text-xs)' }}>
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Forecast Cards (mobile-friendly instead of table) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {filtered.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Icons.Package size={32} style={{ marginBottom: 'var(--space-2)', opacity: 0.5 }} />
            <p>Prognoz uchun yetarli ma&apos;lumot yo&apos;q</p>
            <p style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>POS orqali sotish davom etsin, 2-4 haftadan keyin prognoz ishlaydi</p>
          </div>
        ) : (
          filtered.map(item => {
            const urg = URGENCY_CONFIG[item.urgency] || URGENCY_CONFIG.NORMAL;
            const trd = TREND_ICON[item.trend] || TREND_ICON.STABLE;

            return (
              <div key={item.id} className="card" style={{ padding: 'var(--space-3)' }}>
                {/* Row 1: Name + Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 'var(--font-medium)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.nameUz}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.category?.nameUz}</div>
                  </div>
                  <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', background: urg.bg, color: urg.color, fontSize: '10px', fontWeight: 'var(--font-bold)', flexShrink: 0 }}>
                    {urg.label}
                  </span>
                </div>

                {/* Row 2: Key metrics */}
                <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Ombor: </span>
                    <span style={{ fontWeight: 'var(--font-bold)', color: item.stock <= 5 ? 'var(--error)' : 'var(--text-primary)' }}>{item.stock}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Qolgan: </span>
                    <span style={{ fontWeight: 'var(--font-semibold)', color: item.daysOfSupply <= 7 ? 'var(--error)' : item.daysOfSupply <= 14 ? '#F59E0B' : 'var(--text-secondary)' }}>
                      {item.daysOfSupply >= 999 ? '∞' : `${item.daysOfSupply} kun`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <span style={{ color: trd.color }}>{trd.icon}</span>
                  </div>
                  {item.suggestedOrder > 0 && (
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Zakaz: </span>
                      <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--brand-primary)' }}>{item.suggestedOrder}</span>
                    </div>
                  )}
                </div>

                {/* Row 3: Monthly sales mini chart */}
                <div style={{ display: 'flex', gap: 'var(--space-1)', marginTop: 'var(--space-2)', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: 50 }}>Oylik:</span>
                  {item.monthlySales.map((val, i) => {
                    const maxVal = Math.max(...item.monthlySales, 1);
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <div style={{ width: '100%', height: 20, background: 'var(--bg-tertiary)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                          <div style={{
                            position: 'absolute', bottom: 0, width: '100%',
                            height: `${(val / maxVal) * 100}%`,
                            background: i === 2 ? 'var(--brand-primary)' : 'var(--brand-primary-light)',
                            borderRadius: 2, minHeight: val > 0 ? 2 : 0,
                          }} />
                        </div>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{val}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
