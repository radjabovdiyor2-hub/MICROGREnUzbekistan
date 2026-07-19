import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { loadIssueBySlug } from '@/lib/magazine/data';
import { MagazineDocument } from '@/components/magazine/MagazineDocument';

// Веб-читалка персонального выпуска ресторана (гибрид: веб + кнопка PDF).
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const issue = await loadIssueBySlug(slug);
  if (!issue) return { title: 'Выпуск не найден' };
  return {
    title: `FRESH WEEKLY №${issue.weekNumber} — ${issue.brand.name}`,
    description: `Персональный выпуск Fresh Weekly для гостей ресторана ${issue.brand.name}.`,
  };
}

export default async function MagazineReaderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const issue = await loadIssueBySlug(slug);
  if (!issue) notFound();

  const barBtn: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 600,
    color: '#fff', textDecoration: 'none', padding: '8px 16px',
    borderRadius: '30px', border: '1px solid rgba(255,255,255,0.25)',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#222', padding: '24px 0 60px' }}>
      <div style={{
        maxWidth: '148mm', margin: '0 auto 16px', padding: '0 8px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
      }}>
        <Link href="/magazine" style={barBtn}>← Все выпуски</Link>
        <a href={`/magazine/print/${slug}`} target="_blank" rel="noopener noreferrer" style={barBtn}>🖨 Печать / PDF</a>
      </div>

      {issue.status !== 'published' && (
        <div style={{
          maxWidth: '148mm', margin: '0 auto 16px', padding: '8px 12px',
          background: 'rgba(201,168,76,0.15)', border: '1px solid #c9a84c', borderRadius: '8px',
          color: '#e8d48c', fontFamily: "'Inter', sans-serif", fontSize: '13px', textAlign: 'center',
        }}>
          Черновик · статус «{issue.status}» — виден только по прямой ссылке
        </div>
      )}

      <MagazineDocument
        blocks={issue.blocks}
        brand={issue.brand}
        weekNumber={issue.weekNumber}
        qrDataUrl={issue.qrDataUrl}
        kidsQrDataUrl={issue.kidsQrDataUrl}
      />
    </div>
  );
}
