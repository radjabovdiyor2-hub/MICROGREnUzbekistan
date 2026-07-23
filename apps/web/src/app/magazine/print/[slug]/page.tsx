import { notFound } from 'next/navigation';
import { loadIssueBySlug } from '@/lib/magazine/data';
import { MagazineDocument } from '@/components/magazine/MagazineDocument';

// Печатный таргет: чистый рендер журнала для Playwright → A5 PDF.
// Идёт через "голый" режим AppShell (без Header/BottomNav).
export const dynamic = 'force-dynamic';

export default async function MagazinePrintPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const issue = await loadIssueBySlug(slug);
  if (!issue) notFound();

  return (
    <MagazineDocument
      blocks={issue.blocks}
      brand={issue.brand}
      weekNumber={issue.weekNumber}
      qrDataUrl={issue.qrDataUrl}
    />
  );
}
