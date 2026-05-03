'use client';

import dynamic from 'next/dynamic';

const AiChatWidget = dynamic(
  () => import('@/components/ai/AiChatWidget').then(m => m.AiChatWidget),
  { ssr: false, loading: () => null }
);

export function LazyAiChat() {
  return <AiChatWidget />;
}
