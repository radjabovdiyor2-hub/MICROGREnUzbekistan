import { NextRequest, NextResponse } from 'next/server';
import { notifyOfficeLead } from '@/lib/office/client';
import { notifyAdmin } from '@/lib/notify';
import { consume, clientIp, tooManyRequests } from '@/lib/rateLimit';

// ==========================================
// B2B lead from the site (restaurants / cafes / HoReCa) -> AI-office Sales.
// The office creates a b2b customer with status='lead' and fires B2B_LEAD_CREATED.
// ==========================================
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limit = await consume(`lead:${ip}`, 5, 60 * 60 * 1000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  try {
    const { companyName, contactName, phone, message } = await request.json();
    if (!phone && !contactName && !companyName) {
      return NextResponse.json({ error: 'contact required' }, { status: 400 });
    }

    await notifyOfficeLead({ companyName, contactName, phone, message });
    await notifyAdmin({
      type: 'info',
      message: `🏢 B2B-заявка: ${companyName || '—'} / ${contactName || '—'} ${phone ? `(${phone})` : ''}\n${message || ''}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Lead submit error:', error);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
