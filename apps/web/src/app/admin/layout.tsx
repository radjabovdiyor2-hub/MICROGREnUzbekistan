import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin Panel — Microgreen',
  robots: 'noindex, nofollow',
  manifest: '/manifest-admin.json',
  other: {
    'apple-mobile-web-app-title': 'Microgreen Admin',
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
