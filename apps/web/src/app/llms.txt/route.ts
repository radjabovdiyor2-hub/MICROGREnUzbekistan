import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';

import { CONTACT } from '@/lib/site';
import { buildLlmsTxt } from '@/lib/seo/llmsTxt';
import { getNumber, getSetting } from '@/lib/settings/store';

// Карта магазина для ИИ-агентов. Разделы и причины — в `lib/seo/llmsTxt.ts`.

const DOMAIN = 'https://microgreenuzbekistan.com';
const CACHE_SECONDS = 3600;

export async function GET() {
  // Считаем ТОЛЬКО активные товары: снятый с продажи в счётчике раздела
  // обещал бы агенту ассортимент, которого нет.
  //
  // Разделы под своим `catch`, а настройки нет: `lib/settings/store` уже
  // не бросает и на мёртвой базе отдаёт дефолты. Здесь база нужна по-
  // настоящему, и падение всего файла из-за неё было бы худшим ответом:
  // адрес, телефон и ссылка на фид известны и без неё, а раздел про
  // ассортимент честно скажет, что списка нет.
  const [categories, deliveryFee, freeThreshold, timePromise, phone, address] =
    await Promise.all([
      prisma.category
        .findMany({
          select: {
            nameUz: true,
            slug: true,
            _count: { select: { products: { where: { isActive: true } } } },
          },
          orderBy: { order: 'asc' },
        })
        .catch((error: unknown) => {
          console.error('[llms.txt] разделы каталога недоступны:', error);
          return [];
        }),
      getNumber('delivery.fee'),
      getNumber('delivery.freeThreshold'),
      getSetting('delivery.timePromise'),
      getSetting('contacts.phonePrimary'),
      getSetting('contacts.address'),
    ]);

  const body = buildLlmsTxt({
    domain: DOMAIN,
    categories: categories
      .filter((c) => c._count.products > 0)
      .map((c) => ({ nameUz: c.nameUz, slug: c.slug, count: c._count.products })),
    deliveryFee,
    freeThreshold,
    timePromise,
    phone,
    telegramChannelUrl: CONTACT.telegramChannelUrl,
    telegramBotUrl: CONTACT.telegramBotUrl,
    instagramUrl: CONTACT.instagramUrl,
    address,
  });

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
    },
  });
}
