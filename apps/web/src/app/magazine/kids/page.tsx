import type { Metadata } from 'next';
import Link from 'next/link';
import { KIDS_MECHANICS, type KidsMechanicInfo } from '@/lib/magazine/kids';

export const metadata: Metadata = {
  title: 'Fresh Kids — детская экосистема FRESH WEEKLY',
  description: 'Нейро-сказки, голосовые загадки, паспорт агронума, AR и настолки для детей.',
};

const MODE_BADGE: Record<string, { label: string; color: string }> = {
  online: { label: 'Онлайн', color: '#3a7a32' },
  ar: { label: 'AR-камера', color: '#7c3aed' },
  print: { label: 'В журнале', color: '#c9a84c' },
  bot: { label: 'Telegram', color: '#2563eb' },
};

function Card({ m }: { m: KidsMechanicInfo }) {
  const badge = MODE_BADGE[m.mode];
  const inner = (
    <div style={{
      background: 'var(--bg-elevated, #fff)', border: '1px solid var(--border, #eee)', borderRadius: 20,
      padding: 20, height: '100%', display: 'flex', flexDirection: 'column', gap: 8,
      boxShadow: 'var(--shadow-md, 0 4px 20px rgba(0,0,0,0.06))', transition: 'transform .15s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 40 }}>{m.emoji}</span>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: '#fff', background: badge.color, padding: '3px 10px', borderRadius: 20 }}>{badge.label}</span>
      </div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{m.label}</div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, flex: 1 }}>{m.desc}</div>
      {m.href && (
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: badge.color, marginTop: 4 }}>
          {m.mode === 'bot' ? 'Открыть в Telegram →' : m.mode === 'ar' ? 'Открыть сканер →' : 'Играть →'}
        </div>
      )}
    </div>
  );

  if (!m.href) return <div>{inner}</div>;
  if (m.mode === 'bot') return <a href={m.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{inner}</a>;
  return <Link href={m.href} style={{ textDecoration: 'none' }}>{inner}</Link>;
}

export default function KidsHubPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0B0B14)' }}>
      <section style={{ padding: '100px 20px 40px', textAlign: 'center' }}>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 3, color: 'var(--brand-primary, #3a7a32)', textTransform: 'uppercase', marginBottom: 12 }}>FRESH WEEKLY · 4+</p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(36px, 7vw, 60px)', fontWeight: 900, lineHeight: 1.05, color: 'var(--text-primary)', margin: '0 auto 16px', maxWidth: 800 }}>
          Fresh Kids 🌱
        </h1>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto' }}>
          Девять игр, где еда оживает: сказки с твоим именем, голосовые загадки, AR-раскраски и паспорт юного агронома.
        </p>
      </section>

      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '0 20px 100px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
        {KIDS_MECHANICS.map((m) => <Card key={m.id} m={m} />)}
      </section>
    </div>
  );
}
