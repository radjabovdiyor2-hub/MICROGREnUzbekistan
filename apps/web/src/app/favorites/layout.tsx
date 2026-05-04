import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Sevimlilar — Saqlangan mahsulotlar",
  description: "Siz saqlagan sevimli mahsulotlar. Mikroko'katlar, salatlar va boshqa organik mahsulotlar.",
  robots: 'noindex, follow',
};

export default function FavoritesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
