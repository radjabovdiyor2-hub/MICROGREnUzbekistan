import { NextResponse } from 'next/server';
import { DELIVERY, CONTACT } from '@/lib/site';

// ==========================================
// Public site config — consumed by the storefront bot (config_service.py) so
// bot messages (delivery threshold, contacts, social links) stay in sync with
// the website's single source of truth in lib/site.ts.
// ==========================================
export async function GET() {
  return NextResponse.json({
    heroTitle: 'Microgreen Uzbekistan',
    heroSubtitle: 'Mikrozelen • Gidroponika • Sog‘lom hayot',
    deliveryFee: DELIVERY.fee,
    freeDeliveryThreshold: DELIVERY.freeThreshold,
    contactPhone: CONTACT.phonePrimary,
    contactEmail: 'hello@microgreenuzbekistan.com',
    bannerEnabled: false,
    bannerText: '',
    social: {
      telegramChannel: CONTACT.telegramChannelUrl,
      telegramGroup: CONTACT.telegramChannelUrl,
      telegramBot: CONTACT.telegramBotUrl,
      instagram: CONTACT.instagramUrl,
    },
  });
}
