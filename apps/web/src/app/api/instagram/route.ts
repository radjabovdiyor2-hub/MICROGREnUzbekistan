import { NextResponse } from 'next/server';

// Instagram Graph API — fetches real posts from your account
// Requires INSTAGRAM_ACCESS_TOKEN in .env

const CACHE_TTL = 3600 * 1000; // 1 hour cache
let cachedData: { posts: any[]; timestamp: number } | null = null;

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
    // Fetch recent media from Instagram Graph API
    const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
    const url = `https://graph.instagram.com/me/media?fields=${fields}&limit=9&access_token=${token}`;
    
    const res = await fetch(url, { 
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('Instagram API error:', res.status, errData);
      
      // If token expired, try to refresh it
      if (res.status === 400 && errData?.error?.code === 190) {
        const refreshed = await refreshToken(token);
        if (refreshed) {
          // Retry with new token
          const retryRes = await fetch(
            `https://graph.instagram.com/me/media?fields=${fields}&limit=9&access_token=${refreshed}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            const posts = formatPosts(retryData.data || []);
            cachedData = { posts, timestamp: Date.now() };
            return NextResponse.json({ posts, refreshed: true });
          }
        }
      }

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
function formatPosts(rawPosts: any[]) {
  return rawPosts
    .filter((p: any) => p.media_type !== 'VIDEO' || p.thumbnail_url) // skip videos without thumbnails
    .map((post: any) => ({
      id: post.id,
      caption: post.caption || '',
      mediaUrl: post.media_type === 'VIDEO' ? post.thumbnail_url : post.media_url,
      mediaType: post.media_type, // IMAGE, VIDEO, CAROUSEL_ALBUM
      permalink: post.permalink,
      timestamp: post.timestamp,
    }));
}

// Try to refresh a long-lived token (valid for 60 days, refreshable)
async function refreshToken(currentToken: string): Promise<string | null> {
  try {
    const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      // Note: In production, you'd want to save the new token to .env or a database
      console.log('Instagram token refreshed, new expiry:', data.expires_in, 'seconds');
      return data.access_token;
    }
  } catch (e) {
    console.error('Token refresh failed:', e);
  }
  return null;
}
