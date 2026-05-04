import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Savat — Buyurtma berish",
  description: "Savatdagi mahsulotlarni ko'ring va buyurtma bering. Samarqandda tezkor yetkazib berish — 500,000 so'mdan bepul!",
  robots: 'noindex, follow',
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
