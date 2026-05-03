'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { LazyAiChat } from '@/components/ai/LazyAiChat';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  if (isAdmin) {
    return <main className="admin-root">{children}</main>;
  }

  return (
    <>
      <Header />
      <main className="main-content">
        {children}
      </main>
      <BottomNav />
      <LazyAiChat />
    </>
  );
}
