import { HeroSection } from '@/components/home/HeroSection';
import { CategoriesSection } from '@/components/home/CategoriesSection';
import { SaleBanner } from '@/components/home/SaleBanner';
import { FeaturedProducts } from '@/components/home/FeaturedProducts';
import { AiBanner } from '@/components/home/AiBanner';
import { StoreLocation } from '@/components/home/StoreLocation';
import { Footer } from '@/components/layout/Footer';
import { ScrollReveal } from '@/components/ui/ScrollReveal';

export default function HomePage() {
  return (
    <main>
      <HeroSection />
      <ScrollReveal>
        <CategoriesSection />
      </ScrollReveal>
      <ScrollReveal variant="scale" delay={100}>
        <SaleBanner />
      </ScrollReveal>
      <ScrollReveal>
        <FeaturedProducts />
      </ScrollReveal>
      <ScrollReveal variant="left" delay={50}>
        <AiBanner />
      </ScrollReveal>
      <ScrollReveal delay={100}>
        <StoreLocation />
      </ScrollReveal>
      <Footer />
    </main>
  );
}
