'use client';

import { useState } from 'react';
import { FileText, Leaf } from 'lucide-react';

import { AdminMagazineArticles } from './AdminMagazineArticles';
import { AdminRecipes } from './AdminRecipes';

// ══════════════════════════════════════════════════════════════════════
// Содержимое журнала: материалы и рецепты на одном экране.
//
// ПОЧЕМУ ВМЕСТЕ. На сайте это один раздел: рецепты — такая же рубрика
// журнала, как здоровье или советы хозяйке, и попадают в ту же ленту.
// Двумя вкладками они разъезжались, и «добавить в журнал» означало сначала
// вспомнить, что именно добавляешь.
//
// ПОЧЕМУ НЕ ОДНА ФОРМА. У рецепта своя структура — ингредиенты со связью с
// товаром, шаги с таймерами, сбор набора в корзину — и печатные QR на
// /recipe/<slug>. Свести их к «блокам текста» значит потерять и корзину, и
// уже напечатанные коды.
// ══════════════════════════════════════════════════════════════════════
type ContentTab = 'articles' | 'recipes';

export function AdminMagazineContent({ initialTab = 'articles' }: { initialTab?: ContentTab }) {
  const [tab, setTab] = useState<ContentTab>(initialTab);

  const tabs: { id: ContentTab; label: string; icon: React.ReactNode }[] = [
    { id: 'articles', label: 'Материалы', icon: <FileText size={15} /> },
    { id: 'recipes', label: 'Рецепты', icon: <Leaf size={15} /> },
  ];

  return (
    <div>
      <div style={{ padding: 'var(--space-6) var(--space-6) 0', maxWidth: 900 }}>
        <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)' }}>
          Журнал · содержимое
        </h2>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {tabs.map((x) => (
            <button
              key={x.id}
              className={tab === x.id ? 'btn btn-primary btn-sm' : 'btn btn-sm'}
              onClick={() => setTab(x.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {x.icon} {x.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'articles'
        ? <div style={{ padding: 'var(--space-6)' }}><AdminMagazineArticles /></div>
        : <AdminRecipes />}
    </div>
  );
}
