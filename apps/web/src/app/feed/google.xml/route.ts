import { NextRequest } from 'next/server';

import { getChannelPolicy } from '@/lib/channels/policy';
import { buildFeedItems } from '@/lib/channels/feed/items';
import { renderGoogleMerchant } from '@/lib/channels/feed/googleMerchant';
import { FEED_CACHE, feedLang } from '@/lib/channels/feed/lang';

// ══════════════════════════════════════════════════════════════════════
// Фид Google Merchant Center: /feed/google.xml?lang=uz|ru
//
// Адрес НЕ под `/api/`: в `robots.ts` весь `/api/` закрыт, а Merchant
// забирает фид как обычный краулер и на закрытый адрес не пойдёт.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const lang = feedLang(request.nextUrl.searchParams.get('lang'));
  const policy = await getChannelPolicy('google_shopping');
  const items = await buildFeedItems(policy, lang);

  return new Response(renderGoogleMerchant(items, lang), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': FEED_CACHE,
    },
  });
}
