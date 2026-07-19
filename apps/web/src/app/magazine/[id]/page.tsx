import { Metadata } from 'next';
import { ISSUES } from '@/lib/magazine';
import MagazineIssueClient from './MagazineIssueClient';
import { notFound } from 'next/navigation';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const issue = ISSUES.find(i => i.id === parseInt(params.id));
  
  if (!issue) {
    return { title: 'Выпуск не найден' };
  }

  return {
    title: `FRESH WEEKLY №${issue.id} — ${issue.title}`,
    description: `В этом выпуске: ${issue.highlights.map(h => h.label).join(', ')}`,
    openGraph: {
      title: `FRESH WEEKLY №${issue.id} — ${issue.title}`,
      description: `Читайте новый выпуск интерактивного журнала FRESH WEEKLY.`,
      images: [{ url: issue.cover, width: 1200, height: 630 }],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `FRESH WEEKLY №${issue.id} — ${issue.title}`,
      description: `Читайте новый выпуск интерактивного журнала FRESH WEEKLY.`,
      images: [issue.cover],
    },
  };
}

export default function MagazineIssuePage({ params }: { params: { id: string } }) {
  const issue = ISSUES.find(i => i.id === parseInt(params.id));
  
  if (!issue) {
    notFound();
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `FRESH WEEKLY №${issue.id} — ${issue.title}`,
    image: [issue.cover],
    datePublished: new Date().toISOString(), // Date of indexing/viewing fallback
    author: [{
      '@type': 'Organization',
      name: 'Microgreen Uzbekistan AI Office',
      url: 'https://microgreenuzbekistan.com/'
    }],
    publisher: {
      '@type': 'Organization',
      name: 'Microgreen Uzbekistan',
      logo: {
        '@type': 'ImageObject',
        url: 'https://microgreenuzbekistan.com/logo.png'
      }
    }
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MagazineIssueClient issue={issue} />
    </>
  );
}
