'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { StickyCartBar } from '@/components/shop/StickyCartBar';
import { LazyAiChat } from '@/components/ai/LazyAiChat';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');
  // Печатный роут журнала — без хрома сайта (чистый лист для PDF)
  const isMagPrint = pathname?.startsWith('/magazine/print');

  if (isAdmin || isMagPrint) {
    return <main className={isAdmin ? 'admin-root' : 'mag-print-root'}>{children}</main>;
  }

  return (
    <>
      <Header />
      <PullToRefresh>
        <main className="main-content">
          {children}
        </main>
      </PullToRefresh>
      <StickyCartBar />
      <BottomNav />
      <LazyAiChat />
      <InstallPrompt />
    </>
  );
}
