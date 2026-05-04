'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { LazyAiChat } from '@/components/ai/LazyAiChat';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  if (isAdmin) {
    return <main className="admin-root">{children}</main>;
  }

  return (
    <>
      <Header />
      <PullToRefresh>
        <main className="main-content">
          {children}
        </main>
      </PullToRefresh>
      <BottomNav />
      <LazyAiChat />
      <InstallPrompt />
    </>
  );
}
