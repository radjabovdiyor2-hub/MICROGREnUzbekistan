import dynamic from 'next/dynamic';
import { unstable_cache } from 'next/cache';

import { HeroSection } from '@/components/home/HeroSection';
import { CategoriesSection } from '@/components/home/CategoriesSection';
import { FeaturedProducts } from '@/components/home/FeaturedProducts';
import { CookSection } from '@/components/home/CookSection';
import { RestaurantsTeaser } from '@/components/home/RestaurantsTeaser';
import { MagazineTeaser } from '@/components/home/MagazineTeaser';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { SproutDivider } from '@/components/ui/SproutDivider';
import { latestIssue } from '@/lib/magazine/content';
import { listRecipes } from '@/lib/recipes';

// Lazy-load below-fold sections — reduces initial JS bundle
const NutritionistPanel = dynamic(() => import('@/components/home/NutritionistPanel').then(m => ({ default: m.NutritionistPanel })));
const StoriesBar = dynamic(() => import('@/components/home/StoriesBar').then(m => ({ default: m.StoriesBar })));
const FarmLive = dynamic(() => import('@/components/home/FarmLive').then(m => ({ default: m.FarmLive })));
const FarmSection = dynamic(() => import('@/components/home/FarmSection').then(m => ({ default: m.FarmSection })));
const InstagramFeed = dynamic(() => import('@/components/home/InstagramFeed').then(m => ({ default: m.InstagramFeed })));
const StoreLocation = dynamic(() => import('@/components/home/StoreLocation').then(m => ({ default: m.StoreLocation })));
const InstallAppRow = dynamic(() => import('@/components/pwa/InstallAppRow').then(m => ({ default: m.InstallAppRow })));
const GrowFieldCTA = dynamic(() => import('@/components/home/GrowFieldCTA').then(m => ({ default: m.GrowFieldCTA })));
const RecentlyViewed = dynamic(() => import('@/components/home/RecentlyViewed').then(m => ({ default: m.RecentlyViewed })));
const Footer = dynamic(() => import('@/components/layout/Footer').then(m => ({ default: m.Footer })));

// ══════════════════════════════════════════════════════════════════════
// ПОРЯДОК БЛОКОВ — ЭТО ОТВЕТ НА ВОПРОСЫ ПОСЕТИТЕЛЯ, А НЕ ВИТРИНА ВОЗМОЖНОСТЕЙ.
//
// Раньше шло: герой → сторис → рубрики → товары → просмотренное → рецепт
// дня → Instagram → ИИ-нутрициолог → контакты. Порядок собрался сам собой
// по мере появления блоков, и в нём предложение размывалось: между «что вы
// продаёте» и «как купить» лежали калькулятор питания и лента соцсети.
//
// Теперь по порядку вопросов:
//   1. что продаёте и в каком городе   → герой
//   2. покажите товар                  → популярные
//   3. а что с этим делать             → что приготовить
//   4. я ресторан, вы мне подходите?   → поставки заведениям
//   5. вам вообще можно верить?        → ферма (живые кадры)
//   6. кто вы такие                    → журнал
//   7. как получить                    → доставка, контакты, приложение
//
// ЧТО УШЛО ВНИЗ И ПОЧЕМУ. Лента Instagram и калькулятор питания — не
// предложение, а знакомство и инструмент; они полезны тому, кто уже
// заинтересовался, и стоят после ответа «как получить». Сторис остались
// вверху: это единственный блок, который сам гаснет, когда пуст, и он
// узкий.
//
// ДАННЫЕ ЧИТАЮТСЯ НА СЕРВЕРЕ. Рецепты и номер журнала приходят прямо в
// разметку: прежний «Рецепт дня» ждал ответа модели, поэтому для краулера
// на главной не было ни одной ссылки на рецепт.
// ══════════════════════════════════════════════════════════════════════

// Рецепты и номер журнала меняются раз в недели, а главную открывают
// тысячи раз в день. Без кэша каждый показ шёл бы в Postgres за одним и
// тем же ответом.
//
// Страница всё равно динамическая — не из-за этих запросов, а из-за
// nonce для CSP, который макет читает из заголовков. Поэтому
// `export const revalidate` здесь бесполезен, и кэшировать надо сами
// выборки.
const cachedRecipes = unstable_cache(listRecipes, ['home-recipes'], {
  revalidate: 3600,
  tags: ['recipes'],
});
const cachedIssue = unstable_cache(latestIssue, ['home-issue'], {
  revalidate: 3600,
  tags: ['magazine'],
});

/**
 * Отказ базы не должен ронять входную дверь магазина.
 *
 * Оба блока — рецепты и номер журнала — необязательные: без них главная
 * теряет две секции, но остаётся рабочей витриной с каталогом, контактами
 * и телефоном. Без этой обёртки недоступный Postgres превращал бы её в
 * пятисотую целиком, а раньше она в такой ситуации рисовалась: товары
 * грузились с клиента, и их приёмник честно отвечал «каталог временно
 * недоступен».
 */
async function orEmpty<T>(load: () => Promise<T>, fallback: T, what: string): Promise<T> {
  try {
    return await load();
  } catch (error: unknown) {
    console.error(`[главная] не удалось загрузить ${what}:`, error);
    return fallback;
  }
}

export default async function HomePage() {
  // Параллельно: ни один из запросов не зависит от другого, а
  // последовательные добавили бы к первой отрисовке лишний круг к базе.
  const [recipes, issue] = await Promise.all([
    orEmpty(cachedRecipes, [], 'рецепты'),
    orEmpty(cachedIssue, null, 'номер журнала'),
  ]);

  return (
    <main>
      {/* 1. Продукт и доставка */}
      <HeroSection />

      <StoriesBar />

      <ScrollReveal>
        <CategoriesSection />
      </ScrollReveal>

      {/* 2. Популярные товары — сразу к покупке */}
      <ScrollReveal>
        <FeaturedProducts />
      </ScrollReveal>

      {/* Возврат к отложенной покупке. Пусто при первом визите — блок
          сам возвращает null. */}
      <RecentlyViewed />

      <SproutDivider />

      {/* 3. Что приготовить — блюдо ведёт к нужной зелени */}
      <ScrollReveal delay={80}>
        <CookSection recipes={recipes} />
      </ScrollReveal>

      {/* 4. Для ресторанов */}
      <ScrollReveal delay={80}>
        <RestaurantsTeaser />
      </ScrollReveal>

      <SproutDivider flip />

      {/* 5. Ваша ферма.

          Сначала камера: она показывает теплицу как есть, включая пустые
          стеллажи, и потому убедительнее любого отобранного снимка. Ниже —
          помеченные кадры процесса из ленты.

          Оба блока гаснут сами: камера — когда кадр несвежий, лента —
          когда помеченных постов нет. Сегодня не показывается ни один, и
          это честное состояние, а не поломка. */}
      <ScrollReveal delay={80}>
        <FarmLive />
      </ScrollReveal>

      <ScrollReveal delay={80}>
        <FarmSection />
      </ScrollReveal>

      {/* 6. Журнал */}
      <ScrollReveal delay={80}>
        <MagazineTeaser issue={issue} />
      </ScrollReveal>

      {/* 7. Доставка, контакты и установка приложения */}
      <ScrollReveal delay={100}>
        <StoreLocation />
      </ScrollReveal>
      <div className="container" style={{ paddingBottom: 'var(--space-6)' }}>
        <InstallAppRow />
      </div>

      {/* Знакомство и инструменты — после ответа «как получить» */}
      <ScrollReveal delay={80}>
        <InstagramFeed />
      </ScrollReveal>

      <ScrollReveal variant="left" delay={80}>
        <NutritionistPanel />
      </ScrollReveal>

      <GrowFieldCTA />

      <Footer />
    </main>
  );
}
