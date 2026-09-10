'use client';

import { useQuery } from '@tanstack/react-query';

import { pollInterval, timeoutSignal } from '@/lib/net/connection';
import type { InstaPost } from './instagramFeedData';

// ══════════════════════════════════════════════════════════════════════
// Посты Instagram — один запрос на страницу, а не по одному на блок.
//
// ЗАЧЕМ. Ленту и блок фермы кормит один и тот же адрес. Каждый со своим
// `useEffect` запрашивал его отдельно, и главная дважды тянула одинаковый
// ответ. Замер это и показал: `/api/instagram x2`.
//
// React Query уже подключён в приложении, но на главной им никто не
// пользовался — все блоки ходили сырым `fetch` в эффекте. Один ключ
// склеивает оба обращения в одно и держит ответ в памяти при переходах.
//
// ЧАС ЖИЗНИ — столько же, сколько кэш на сервере (`CACHE_TTL` в
// `api/instagram`). Спрашивать чаще, чем обновляется источник, бессмысленно.
// ══════════════════════════════════════════════════════════════════════

const HOUR = 60 * 60 * 1000;

export interface InstagramFeedData {
  posts: InstaPost[];
  /** Настоящие ли это посты. `false` — Instagram молчит. */
  isReal: boolean;
}

export function useInstagramPosts() {
  return useQuery<InstagramFeedData>({
    queryKey: ['instagram-posts'],
    queryFn: async () => {
      const res = await fetch('/api/instagram', { signal: timeoutSignal() });
      const data = (await res.json()) as { posts?: InstaPost[] };
      const posts = Array.isArray(data.posts) ? data.posts : [];
      return { posts, isReal: posts.length > 0 };
    },
    staleTime: HOUR,
    gcTime: HOUR,
    // На слабой связи реже, без связи — не спрашиваем вовсе.
    refetchInterval: pollInterval(HOUR),
    // Лента — не то, ради чего человек вернулся во вкладку.
    refetchOnWindowFocus: false,
  });
}
