import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FRESH WEEKLY — Журнал о еде, ресторанах и здоровье',
  description: 'Еженедельный интерактивный журнал: рестораны Ташкента и Самарканда, стрит-фуд мира, рецепты для шефов и хозяек, нутрициология, фитнес, IT-стартапы. С дополненной реальностью!',
  openGraph: {
    title: 'FRESH WEEKLY — Выпуск №1',
    description: 'Интерактивный журнал о еде, здоровье и технологиях. Читайте онлайн, скачивайте PDF или закажите печатную копию.',
    type: 'article',
    images: [{ url: '/img/og-magazine.jpg', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FRESH WEEKLY — Журнал о еде, ресторанах и здоровье',
    description: 'Еженедельный интерактивный журнал: рестораны Ташкента и Самарканда, стрит-фуд мира, рецепты для шефов и хозяек, нутрициология, фитнес, IT-стартапы. С дополненной реальностью!',
    images: ['/img/og-magazine.jpg'],
  },
};

export default function MagazineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
