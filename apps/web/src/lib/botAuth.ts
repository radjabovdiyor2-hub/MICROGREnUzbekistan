import { NextRequest } from 'next/server';

// Shared-secret auth for storefront-bot -> web API calls. The bot sends
// `Authorization: Bearer <BOT_SECRET>` (apps/bot _api_headers). If BOT_SECRET is
// unset on the web side we allow the call (local dev / secret not configured yet),
// mirroring how INGEST_SECRET is treated as optional.
export function requireBotAuth(request: NextRequest): boolean {
  const secret = process.env.BOT_SECRET;
  if (!secret) return true;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}
