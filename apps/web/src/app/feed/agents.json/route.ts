import { NextRequest, NextResponse } from 'next/server';

import { getChannelPolicy } from '@/lib/channels/policy';
import { buildFeedItems } from '@/lib/channels/feed/items';
import { renderAgentFeed } from '@/lib/channels/feed/agents';
import { FEED_CACHE, feedLang } from '@/lib/channels/feed/lang';

// ══════════════════════════════════════════════════════════════════════
// Фид для агентских витрин: /feed/agents.json?lang=uz|ru
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const lang = feedLang(request.nextUrl.searchParams.get('lang'));
  const policy = await getChannelPolicy('ai_agents');
  const items = await buildFeedItems(policy, lang);

  return NextResponse.json(renderAgentFeed(items, lang), {
    headers: { 'Cache-Control': FEED_CACHE },
  });
}
