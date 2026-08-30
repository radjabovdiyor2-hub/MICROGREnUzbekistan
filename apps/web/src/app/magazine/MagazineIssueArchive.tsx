import type { IssueCard } from '@/lib/magazine/content';

// Архив номеров. Ссылка ведёт на файл вёрстки, а не на страницу-обёртку:
// номер и есть готовая страница, лишний переход между ней и читателем
// ничего не добавляет.
export function MagazineIssueArchive({ issues }: { issues: IssueCard[] }) {
  if (issues.length === 0) return null;

  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 80px' }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 24 }}>
        Архив номеров
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
        {issues.map((issue) => (
          <a
            key={issue.slug}
            href={issue.webUrl || issue.pdfUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 18, overflow: 'hidden', textDecoration: 'none',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div
              style={{
                aspectRatio: '148 / 210',
                background: 'linear-gradient(135deg, var(--editorial-cover-slate), var(--editorial-cover-slate-deep))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {issue.coverImage
                ? <img src={issue.coverImage} alt={issue.titleRu} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 32 }}>📖</span>}
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-primary)', marginBottom: 6 }}>
                №{issue.number}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                {issue.titleRu}
              </div>
              {issue.restaurantName && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {issue.restaurantName}
                </div>
              )}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
