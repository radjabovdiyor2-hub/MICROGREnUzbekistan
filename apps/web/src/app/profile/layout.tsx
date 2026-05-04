import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Profil — Shaxsiy kabinet",
  description: "Shaxsiy kabinet — bonuslar, sozlamalar, taklif kodi. Microgreen Uzbekistan.",
  robots: 'noindex, follow',
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
