import { HeroSection } from '@/components/home/HeroSection';
import { CategoriesSection } from '@/components/home/CategoriesSection';
import { SaleBanner } from '@/components/home/SaleBanner';
import { FeaturedProducts } from '@/components/home/FeaturedProducts';
import { AiBanner } from '@/components/home/AiBanner';
import { StoreLocation } from '@/components/home/StoreLocation';
import { Footer } from '@/components/layout/Footer';

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <CategoriesSection />
      <SaleBanner />
      <FeaturedProducts />
      <AiBanner />
      <StoreLocation />
      <Footer />
    </>
  );
}
