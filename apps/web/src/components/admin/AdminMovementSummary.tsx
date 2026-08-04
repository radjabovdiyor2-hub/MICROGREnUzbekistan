'use client';

// Сводка движений за день: приход, расход, себестоимость.


interface Props {
  total: number;
  todayIn: number;
  todayOut: number;
  todayCost: number;
  fmt: (n: number) => string;
}

export function AdminMovementSummary({ total, todayIn, todayOut, todayCost, fmt }: Props) {
  return (
    <>
    {/* Summary cards */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
      <div className="card" style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Jami</div>
        <div style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{total}</div>
      </div>
      <div className="card" style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Bugun kirim</div>
        <div style={{ fontWeight: 700, color: 'var(--success)' }}>+{todayIn}</div>
      </div>
      <div className="card" style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Bugun chiqim</div>
        <div style={{ fontWeight: 700, color: 'var(--error)' }}>-{todayOut}</div>
      </div>
      <div className="card" style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Kirim qiymati</div>
        <div style={{ fontWeight: 700, fontSize: 'var(--text-xs)' }}>{todayCost > 0 ? fmt(todayCost) : '-'}</div>
      </div>
    </div>
    </>
  );
}
