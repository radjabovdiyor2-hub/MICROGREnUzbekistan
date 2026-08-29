import { NextRequest } from 'next/server';

import { getChannelPolicy } from '@/lib/channels/policy';
import { buildFeedItems } from '@/lib/channels/feed/items';
import { renderMetaCsv } from '@/lib/channels/feed/meta';
import { FEED_CACHE, feedLang } from '@/lib/channels/feed/lang';

// ══════════════════════════════════════════════════════════════════════
// Каталог Meta: /feed/meta.csv?lang=uz|ru
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const lang = feedLang(request.nextUrl.searchParams.get('lang'));
  const policy = await getChannelPolicy('meta_catalog');
  const items = await buildFeedItems(policy, lang);

  return new Response(renderMetaCsv(items), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': FEED_CACHE,
    },
  });
}
