import type { Metadata } from 'next';
import Link from 'next/link';
import { KIDS_MECHANICS } from '@/lib/magazine/kids';

export const metadata: Metadata = {
  title: 'Fresh Kids — детский интерактив FRESH WEEKLY',
  description: 'Фуд-арт конструктор, квест «Посади и Съешь», AR-раскраска — три интерактивные игры для детей в журнале FRESH WEEKLY.',
};

export default function KidsHubPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0B0B14)' }}>
      <section style={{ padding: '100px 20px 40px', textAlign: 'center' }}>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 3, color: 'var(--brand-primary, #3a7a32)', textTransform: 'uppercase', marginBottom: 12 }}>FRESH WEEKLY · 4+</p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(36px, 7vw, 60px)', fontWeight: 900, lineHeight: 1.05, color: 'var(--text-primary)', margin: '0 auto 16px', maxWidth: 800 }}>
          Fresh Kids 🌱
        </h1>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
          Три интерактивные игры, где еда оживает: конструктор из продуктов, квест выращивания и AR-раскраска.
        </p>
      </section>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px 60px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
        {KIDS_MECHANICS.map(m => (
          <Link key={m.id} href={m.href || '#'} style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--bg-elevated, #fff)', border: '1px solid var(--border, #eee)', borderRadius: 20,
              padding: 24, height: '100%', display: 'flex', flexDirection: 'column', gap: 10,
              boxShadow: 'var(--shadow-md, 0 4px 20px rgba(0,0,0,0.06))', transition: 'transform .15s',
            }}>
              <span style={{ fontSize: 48 }}>{m.emoji}</span>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{m.label}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, flex: 1 }}>{m.desc}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--brand-primary, #3a7a32)', marginTop: 4 }}>
                Играть →
              </div>
            </div>
          </Link>
        ))}
      </section>

      {/* Ссылки */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px 100px', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/magazine/ar" style={linkStyle}>📸 AR-сканер</Link>
          <Link href="/magazine/collection" style={linkStyle}>🌿 Коллекция</Link>
          <Link href="/magazine" style={{ ...linkStyle, background: 'transparent', border: '1px solid var(--border, #ccc)', color: 'var(--text-primary)' }}>← Журнал</Link>
        </div>
      </section>
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '12px 24px', borderRadius: 30,
  background: 'var(--brand-primary, #3a7a32)', color: '#fff',
  fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700,
  textDecoration: 'none',
};
