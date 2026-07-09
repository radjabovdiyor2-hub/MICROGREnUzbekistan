// ==========================================
// Storefront -> AI-office client helpers (fire-and-forget, best-effort).
// Every signal a customer produces on the site (signup, complaint, B2B lead,
// review) is mirrored into the office so Stepan/Sales/Support/Analytics react.
// ==========================================

// Resolve an office ingest URL for a given suffix (e.g. "customer" -> .../ingest/customer).
// Prefers an explicit OFFICE_<SUFFIX>_URL, else derives from OFFICE_INGEST_URL.
function officeUrl(suffix: string): string | undefined {
  const explicit = process.env[`OFFICE_${suffix.toUpperCase()}_URL`];
  if (explicit) return explicit;
  return process.env.OFFICE_INGEST_URL?.replace(/\/order$/, `/${suffix}`);
}

async function postOffice(suffix: string, body: unknown): Promise<void> {
  const url = officeUrl(suffix);
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.INGEST_SECRET ? { 'X-Ingest-Secret': process.env.INGEST_SECRET } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    });
  } catch (err) {
    console.error(`Office ${suffix} sync failed (request still ok):`, err);
  }
}

// Register/refresh a customer in the office CRM (signup / first sign-in).
export async function notifyOfficeCustomer(user: {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  telegramId?: bigint | number | string | null;
  bonusPoints?: number | null;
  language?: string | null;
}): Promise<void> {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
  await postOffice('customer', {
    name,
    phone: user.phone ?? null,
    telegram_id: user.telegramId ? user.telegramId.toString() : null,
    bonus_balance: user.bonusPoints ?? 0,
    language: user.language ?? 'ru',
  });
}

// Customer support message / complaint -> office support (PM raises an urgent task).
export async function notifyOfficeSupport(input: {
  name?: string | null;
  phone?: string | null;
  telegramId?: bigint | number | string | null;
  message: string;
}): Promise<void> {
  await postOffice('support', {
    name: input.name ?? null,
    phone: input.phone ?? null,
    telegram_id: input.telegramId ? input.telegramId.toString() : null,
    message: input.message,
  });
}

// B2B lead from the site -> office Sales funnel.
export async function notifyOfficeLead(input: {
  companyName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  message?: string | null;
}): Promise<void> {
  await postOffice('lead', {
    company_name: input.companyName ?? null,
    contact_name: input.contactName ?? null,
    phone: input.phone ?? null,
    message: input.message ?? null,
  });
}

// Product review / feedback -> office (Analytics + Stepan see sentiment).
export async function notifyOfficeFeedback(input: {
  name?: string | null;
  telegramId?: bigint | number | string | null;
  product?: string | null;
  rating: number;
  comment?: string | null;
}): Promise<void> {
  await postOffice('feedback', {
    name: input.name ?? null,
    telegram_id: input.telegramId ? input.telegramId.toString() : null,
    product: input.product ?? null,
    rating: input.rating,
    comment: input.comment ?? null,
  });
}
