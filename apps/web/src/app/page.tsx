import dynamic from 'next/dynamic';
import { HeroSection } from '@/components/home/HeroSection';
import { CategoriesSection } from '@/components/home/CategoriesSection';
import { FeaturedProducts } from '@/components/home/FeaturedProducts';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { Tamagotchi } from '@/components/home/Tamagotchi';

// Lazy-load below-fold sections — reduces initial JS bundle
const SaleBanner = dynamic(() => import('@/components/home/SaleBanner').then(m => ({ default: m.SaleBanner })));
const RecipeOfDay = dynamic(() => import('@/components/home/RecipeOfDay').then(m => ({ default: m.RecipeOfDay })));
const NutritionistPanel = dynamic(() => import('@/components/home/NutritionistPanel').then(m => ({ default: m.NutritionistPanel })));
const AiBanner = dynamic(() => import('@/components/home/AiBanner').then(m => ({ default: m.AiBanner })));
const AiNutritionistBanner = dynamic(() => import('@/components/home/AiNutritionistBanner').then(m => ({ default: m.AiNutritionistBanner })));
const InstagramFeed = dynamic(() => import('@/components/home/InstagramFeed').then(m => ({ default: m.InstagramFeed })));
const StoreLocation = dynamic(() => import('@/components/home/StoreLocation').then(m => ({ default: m.StoreLocation })));
const Footer = dynamic(() => import('@/components/layout/Footer').then(m => ({ default: m.Footer })));

export default function HomePage() {
  return (
    <main>
      {/* Above-the-fold — loaded immediately */}
      <HeroSection />
      <ScrollReveal>
        <CategoriesSection />
      </ScrollReveal>
      <ScrollReveal>
        <div className="container">
          <Tamagotchi />
        </div>
      </ScrollReveal>

      {/* Below-the-fold — lazy loaded */}
      <ScrollReveal variant="scale" delay={100}>
        <SaleBanner />
      </ScrollReveal>
      <ScrollReveal delay={80}>
        <RecipeOfDay />
      </ScrollReveal>
      <ScrollReveal variant="left" delay={80}>
        <NutritionistPanel />
      </ScrollReveal>
      <ScrollReveal>
        <FeaturedProducts />
      </ScrollReveal>
      <ScrollReveal variant="left" delay={50}>
        <AiBanner />
      </ScrollReveal>
      <ScrollReveal delay={60}>
        <AiNutritionistBanner />
      </ScrollReveal>
      <ScrollReveal delay={80}>
        <InstagramFeed />
      </ScrollReveal>
      <ScrollReveal delay={100}>
        <StoreLocation />
      </ScrollReveal>
      <Footer />
    </main>
  );
}
