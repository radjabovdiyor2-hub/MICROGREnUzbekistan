import { NextResponse } from 'next/server';

// Active Instagram Stories of our own Business account via Facebook Graph API.
// GET /{ig-user-id}/stories — returns currently-active stories (expire in 24h).
// Requires INSTAGRAM_ACCESS_TOKEN (Page/User token) in .env.

const CACHE_TTL = 5 * 60 * 1000; // 5 min — stories are short-lived
let cachedData: { stories: StoryItem[]; timestamp: number } | null = null;

const IG_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID || '17841475487793099';

interface StoryItem {
  id: string;
  mediaType: string; // IMAGE | VIDEO
  mediaUrl: string;
  permalink: string;
  timestamp: string;
}

export async function GET() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;

  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
    return NextResponse.json({ stories: cachedData.stories, cached: true });
  }

  if (!token) {
    return NextResponse.json({ stories: [], error: 'INSTAGRAM_ACCESS_TOKEN not configured' });
  }

  try {
    const fields = 'id,media_type,media_url,thumbnail_url,permalink,timestamp';
    const url = `https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/stories?fields=${fields}&access_token=${token}`;

    const res = await fetch(url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('Instagram stories API error:', res.status, errData);
      if (cachedData) {
        return NextResponse.json({ stories: cachedData.stories, cached: true, stale: true });
      }
      return NextResponse.json({ stories: [], error: 'Instagram stories API error' });
    }

    const data = await res.json();
    const stories: StoryItem[] = (data.data || []).map((s: any) => ({
      id: s.id,
      mediaType: s.media_type,
      mediaUrl: s.media_type === 'VIDEO' ? s.media_url : (s.media_url || s.thumbnail_url),
      permalink: s.permalink,
      timestamp: s.timestamp,
    })).filter((s: StoryItem) => s.mediaUrl);

    cachedData = { stories, timestamp: Date.now() };
    return NextResponse.json({ stories });
  } catch (error) {
    console.error('Instagram stories fetch error:', error);
    if (cachedData) {
      return NextResponse.json({ stories: cachedData.stories, cached: true, stale: true });
    }
    return NextResponse.json({ stories: [], error: 'Failed to fetch' });
  }
}
