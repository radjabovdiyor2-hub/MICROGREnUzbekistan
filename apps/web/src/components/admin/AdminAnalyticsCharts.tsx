'use client';

import React from 'react';
import { BarChart, AlertTriangle, Download, Package, CreditCard, ClipboardList, ShoppingCart, Sprout, Users, Wallet } from 'lucide-react';

export interface MonthData { month: string; orders: number; revenue: number; posRevenue: number; posSales: number; }
export interface Warning { level: string; message: string; action: string; }

export function WarningsWidget({ warnings }: { warnings: Warning[] }) {
  if (!warnings.length) return null;
  return (
    <div className="card" style={{ padding: 'var(--space-4)', borderLeft: '3px solid var(--error)' }}>
      <h4 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--error)' }}>
        <AlertTriangle size={16} /> Ogohlantirishlar ({warnings.length})
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        {warnings.slice(0, 5).map((w, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-1) 0', fontSize: 'var(--text-sm)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: w.level === 'CRITICAL' ? 'var(--error)' : 'var(--warning)', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{w.message}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--brand-primary)', fontWeight: 'var(--font-medium)' }}>{w.action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MonthlyChart({ monthlyData, maxRevenue }: { monthlyData: MonthData[]; maxRevenue: number }) {
  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <h4 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <BarChart size={16} /> Oylik savdolar
      </h4>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)', height: 180, padding: '0 var(--space-2)' }}>
        {monthlyData.map((d, i) => {
          const totalRev = d.revenue + d.posRevenue;
          const heightPct = (totalRev / maxRevenue) * 100;
          const onlinePct = totalRev > 0 ? (d.revenue / totalRev) * 100 : 50;

          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 'var(--font-bold)', whiteSpace: 'nowrap' }}>
                {totalRev > 1000000 ? `${(totalRev / 1000000).toFixed(1)}M` : totalRev > 0 ? `${Math.round(totalRev / 1000)}K` : '-'}
              </div>
              <div style={{ width: '100%', maxWidth: 48, height: `${Math.max(heightPct, 4)}%`, borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: onlinePct, background: 'var(--brand-primary)', minHeight: totalRev > 0 ? 2 : 0 }} />
                <div style={{ flex: 100 - onlinePct, background: 'var(--success)', minHeight: totalRev > 0 ? 2 : 0 }} />
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 4 }}>
                {d.month.split(' ')[0]}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center', marginTop: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--brand-primary)' }} /> Online
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--success)' }} /> Do&apos;kon
        </div>
      </div>
    </div>
  );
}

export function ExportWidget() {
  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <h4 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)' }}>
        <Download size={16} /> Hisobotlar yuklab olish (CSV)
      </h4>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {[
          { type: 'inventory', label: 'Ombor hisoboti', icon: <Package size={14} /> },
          { type: 'debts', label: 'Qarzlar hisoboti', icon: <CreditCard size={14} /> },
          { type: 'movements', label: 'Harakatlar tarixi', icon: <ClipboardList size={14} /> },
          { type: 'sales', label: 'Sotishlar (30 kun)', icon: <BarChart size={14} /> },
          // Четырёх выгрузок не хватало ровно того, что чаще всего просят
          // унести в таблицу: клиентской базы, заказов, денег и посадок.
          { type: 'customers', label: 'Mijozlar bazasi', icon: <Users size={14} /> },
          { type: 'orders', label: 'Buyurtmalar', icon: <ShoppingCart size={14} /> },
          { type: 'finance', label: 'Moliya', icon: <Wallet size={14} /> },
          { type: 'growing', label: 'Ekishlar', icon: <Sprout size={14} /> },
        ].map(exp => (
          <a key={exp.type} href={`/api/inventory/export?type=${exp.type}`} download
            className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {exp.icon} {exp.label}
          </a>
        ))}
      </div>
    </div>
  );
}
