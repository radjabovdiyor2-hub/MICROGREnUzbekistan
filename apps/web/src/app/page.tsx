import dynamic from 'next/dynamic';
import { HeroSection } from '@/components/home/HeroSection';
import { CategoriesSection } from '@/components/home/CategoriesSection';
import { FeaturedProducts } from '@/components/home/FeaturedProducts';
import { ScrollReveal } from '@/components/ui/ScrollReveal';

// Lazy-load below-fold sections — reduces initial JS bundle
const SaleBanner = dynamic(() => import('@/components/home/SaleBanner').then(m => ({ default: m.SaleBanner })));
const RecipeOfDay = dynamic(() => import('@/components/home/RecipeOfDay').then(m => ({ default: m.RecipeOfDay })));
const NutritionistPanel = dynamic(() => import('@/components/home/NutritionistPanel').then(m => ({ default: m.NutritionistPanel })));
const StoriesBar = dynamic(() => import('@/components/home/StoriesBar').then(m => ({ default: m.StoriesBar })));
const StoreLocation = dynamic(() => import('@/components/home/StoreLocation').then(m => ({ default: m.StoreLocation })));
const Footer = dynamic(() => import('@/components/layout/Footer').then(m => ({ default: m.Footer })));

export default function HomePage() {
  return (
    <main>
      {/* Hero — первое впечатление + CTA "Каталог" */}
      <HeroSection />

      {/* Instagram Stories — живой контент */}
      <StoriesBar />

      {/* Категории — быстрый вход в каталог */}
      <ScrollReveal>
        <CategoriesSection />
      </ScrollReveal>

      {/* Акция / скидка — мотивация к покупке */}
      <ScrollReveal variant="scale" delay={100}>
        <SaleBanner />
      </ScrollReveal>

      {/* Рецепт дня — вдохновение к покупке */}
      <ScrollReveal delay={80}>
        <RecipeOfDay />
      </ScrollReveal>

      {/* Хиты продаж — сразу добавить в корзину */}
      <ScrollReveal>
        <FeaturedProducts />
      </ScrollReveal>

      {/* AI Нутрициолог — экспертность и доверие */}
      <ScrollReveal variant="left" delay={80}>
        <NutritionistPanel />
      </ScrollReveal>

      {/* Адрес и контакты */}
      <ScrollReveal delay={100}>
        <StoreLocation />
      </ScrollReveal>

      <Footer />
    </main>
  );
}
