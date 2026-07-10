import dynamic from 'next/dynamic';
import { HeroSection } from '@/components/home/HeroSection';
import { CategoriesSection } from '@/components/home/CategoriesSection';
import { FeaturedProducts } from '@/components/home/FeaturedProducts';
import { ScrollReveal } from '@/components/ui/ScrollReveal';

// Lazy-load below-fold sections — reduces initial JS bundle
const RecipeOfDay = dynamic(() => import('@/components/home/RecipeOfDay').then(m => ({ default: m.RecipeOfDay })));
const NutritionistPanel = dynamic(() => import('@/components/home/NutritionistPanel').then(m => ({ default: m.NutritionistPanel })));
const StoriesBar = dynamic(() => import('@/components/home/StoriesBar').then(m => ({ default: m.StoriesBar })));
const InstagramFeed = dynamic(() => import('@/components/home/InstagramFeed').then(m => ({ default: m.InstagramFeed })));
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

      {/* Instagram — процесс выращивания + сетка постов */}
      <ScrollReveal delay={80}>
        <InstagramFeed />
      </ScrollReveal>

      {/* Адрес и контакты */}
      <ScrollReveal delay={100}>
        <StoreLocation />
      </ScrollReveal>

      <Footer />
    </main>
  );
}
