export function MagazineSectionsGrid({ sections }: { sections: string[] }) {
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        borderRadius: '24px',
        padding: '32px',
        border: '1px solid var(--border)',
        gridColumn: '1 / -1',
      }}
    >
      <h4
        style={{
          fontSize: '16px',
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          marginBottom: '24px',
        }}
      >
        В Этом Выпуске
      </h4>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
        }}
      >
        {sections.map((label) => (
          <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <span style={{ fontSize: '18px', color: 'var(--brand-primary)' }}>•</span>
            <h5 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</h5>
          </div>
        ))}
      </div>
    </div>
  );
}
