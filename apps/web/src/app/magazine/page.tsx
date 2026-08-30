import Link from 'next/link';

import { listPublishedIssues, listArticles, countArticlesByRubric } from '@/lib/magazine/content';
import { listRecipes, type RecipeCardView } from '@/lib/recipes';
import { RecipeCard } from '@/components/recipe/RecipeCard';
import { MagazineIssueSpotlight } from './MagazineIssueSpotlight';
import { MagazineRubricGrid } from './MagazineRubricGrid';
import { MagazineArticleCard } from './MagazineArticleCard';
import { MagazineIssueArchive } from './MagazineIssueArchive';
import { MagazineSubscribeCTA } from './MagazineSubscribeCTA';

// ══════════════════════════════════════════════════════════════════════
// Витрина журнала: рубрики, материалы, рецепты и вышедшие номера.
//
// ЧТО БЫЛО. Страница показывала персональные выпуски, которые складывал
// крон, — «Автоматический выпуск» с шаблонным текстом внутри. Настоящий
// номер, свёрстанный руками и опубликованный в public/magazine, сюда не
// попадал вовсе: его нужно было отдельно привязать к карточке ресторана.
//
// ЧТО ЗДЕСЬ. Журнал как раздел о еде, здоровье, ресторанах и хозяйстве:
// рубрики впереди номера, потому что читать между номерами тоже есть что.
// Рецепты — такая же рубрика, только её содержимое живёт своей моделью:
// у рецепта шаги, таймеры и сбор набора в корзину, и печатные QR ведут на
// /recipe/<slug>, поэтому переносить их сюда нельзя.
// ══════════════════════════════════════════════════════════════════════
export const dynamic = 'force-dynamic';

export default async function MagazinePage() {
  const [issues, articles, counts, recipes] = await Promise.all([
    listPublishedIssues(),
    listArticles(undefined, 6),
    countArticlesByRubric(),
    listRecipes().catch((): RecipeCardView[] => []),
  ]);

  const latest = issues[0] ?? null;
  const archive = issues.slice(1);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <section
        style={{
          padding: '100px 20px 60px', textAlign: 'center',
          background: 'var(--bg-mesh)', borderBottom: '1px solid var(--border)',
        }}
      >
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--brand-primary)', marginBottom: 16 }}>
          MICROGREEN UZBEKISTAN
        </p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(48px, 8vw, 84px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: -1, color: 'var(--text-primary)' }}>
          FRESH WEEKLY
        </h1>
        <p style={{ fontSize: 18, fontWeight: 500, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: 620, margin: '20px auto 0' }}>
          Ovqat, salomatlik va uy haqidagi jurnal — retseptlar, restoranlar, bekaga maslahatlar va chegirmalar.
        </p>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--text-muted)', maxWidth: 620, margin: '10px auto 0' }}>
          Журнал о еде, здоровье и доме: рецепты, рестораны, советы хозяйке и скидки к салатам.
        </p>
      </section>

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 20px 0' }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 20 }}>
          Темы журнала
        </h2>
        <MagazineRubricGrid counts={counts} recipeCount={recipes.length} />
      </section>

      {articles.length > 0 && (
        <section style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 20px 0' }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 20 }}>
            Свежие материалы
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
            {articles.map((a) => <MagazineArticleCard key={a.slug} article={a} />)}
          </div>
        </section>
      )}

      {recipes.length > 0 && (
        <section style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 20px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>
              Рецепты с микрозеленью
            </h2>
            <Link href="/magazine/recipes" style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand-primary)', textDecoration: 'none' }}>
              Все рецепты →
            </Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {recipes.slice(0, 4).map((r) => <RecipeCard key={r.slug} recipe={r} />)}
          </div>
        </section>
      )}

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 20px 60px' }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 20 }}>
          Печатный номер
        </h2>
        {latest ? (
          <MagazineIssueSpotlight issue={latest} />
        ) : (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 24, padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📖</div>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
              Номер готовится
            </h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Как только номер выйдет из печати, он появится здесь — с чтением онлайн и PDF.
            </p>
          </div>
        )}
      </section>

      <MagazineIssueArchive issues={archive} />

      <MagazineSubscribeCTA />
    </div>
  );
}
