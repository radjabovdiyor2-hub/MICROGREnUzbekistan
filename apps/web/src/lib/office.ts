// ==========================================
// Storefront -> AI-office client helpers (fire-and-forget, best-effort).
// ==========================================

// Register/refresh a customer in the office CRM. Called when a customer first
// signs in (Mini App) or registers on the site, so the office sees every lead —
// not only those who placed an order.
export async function notifyOfficeCustomer(user: {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  telegramId?: bigint | number | string | null;
  bonusPoints?: number | null;
  language?: string | null;
}): Promise<void> {
  const url =
    process.env.OFFICE_CUSTOMER_URL ||
    process.env.OFFICE_INGEST_URL?.replace(/\/order$/, '/customer');
  if (!url) return;

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.INGEST_SECRET ? { 'X-Ingest-Secret': process.env.INGEST_SECRET } : {}),
      },
      body: JSON.stringify({
        name,
        phone: user.phone ?? null,
        telegram_id: user.telegramId ? user.telegramId.toString() : null,
        bonus_balance: user.bonusPoints ?? 0,
        language: user.language ?? 'ru',
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (err) {
    console.error('Office customer sync failed (signup still ok):', err);
  }
}
