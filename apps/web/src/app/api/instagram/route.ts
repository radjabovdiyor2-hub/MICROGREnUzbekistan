import { NextResponse } from 'next/server';

// Instagram Business API via Facebook Graph API
// Uses Page Token + Instagram Business Account ID
// Requires INSTAGRAM_ACCESS_TOKEN (Page Token) in .env

const CACHE_TTL = 3600 * 1000; // 1 hour cache

/** Пост в том виде, в каком его отдаёт Graph API — все поля необязательны. */
interface RawInstagramPost {
  id?: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
}

/** Пост в том виде, в каком его ждёт витрина. */
interface FormattedPost {
  id: string;
  caption: string;
  mediaUrl: string;
  mediaType: string;
  permalink: string;
  timestamp: string;
}

let cachedData: { posts: FormattedPost[]; timestamp: number } | null = null;

// Instagram Business Account ID (from Facebook Page)
const IG_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID || '17841475487793099';

export async function GET() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;

  // Return cached data if fresh
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
    return NextResponse.json({ posts: cachedData.posts, cached: true });
  }

  if (!token) {
    return NextResponse.json({ posts: [], error: 'INSTAGRAM_ACCESS_TOKEN not configured' });
  }

  try {
    // Fetch recent media via Facebook Graph API (works with Page Token)
    const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
    const url = `https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media?fields=${fields}&limit=9&access_token=${token}`;
    
    const res = await fetch(url, { 
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('Instagram API error:', res.status, errData);

      // Return cached data as fallback
      if (cachedData) {
        return NextResponse.json({ posts: cachedData.posts, cached: true, stale: true });
      }
      return NextResponse.json({ posts: [], error: 'Instagram API error' });
    }

    const data = await res.json();
    const posts = formatPosts(data.data || []);

    // Update cache
    cachedData = { posts, timestamp: Date.now() };

    return NextResponse.json({ posts });
  } catch (error) {
    console.error('Instagram fetch error:', error);
    // Return cached data as fallback
    if (cachedData) {
      return NextResponse.json({ posts: cachedData.posts, cached: true, stale: true });
    }
    return NextResponse.json({ posts: [], error: 'Failed to fetch' });
  }
}

// Format posts for frontend consumption
function formatPosts(rawPosts: RawInstagramPost[]): FormattedPost[] {
  return rawPosts
    .filter((p) => p.media_type !== 'VIDEO' || p.thumbnail_url) // skip videos without thumbnails
    .map((post) => ({
      id: post.id ?? '',
      caption: post.caption || '',
      mediaUrl: (post.media_type === 'VIDEO' ? post.thumbnail_url : post.media_url) ?? '',
      mediaType: post.media_type ?? 'IMAGE', // IMAGE, VIDEO, CAROUSEL_ALBUM
      permalink: post.permalink ?? '',
      timestamp: post.timestamp ?? '',
    }));
}
