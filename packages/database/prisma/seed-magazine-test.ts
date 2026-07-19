import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'Syrovarnya Test 2',
      slug: 'syrovarnya-test-2',
      logo: 'https://placehold.co/400x400/png?text=Syrovarnya',
      brandPrimary: '#E86121',
      brandAccent: '#2C3E50',
      promoCode: 'TEST2026-2',
      promoDiscount: 15,
      city: 'Ташкент',
      tier: 'PREMIUM'
    }
  });

  const edition = await prisma.magazineEdition.create({
    data: {
      weekNumber: 43,
      title: 'Осенний выпуск 2',
      sharedSpec: {
        blocks: [
          { type: 'COVER', content: { headline: 'Microgreen x Syrovarnya' } }
        ]
      },
      isPublished: true
    }
  });

  const issue = await prisma.restaurantIssue.create({
    data: {
      restaurantId: restaurant.id,
      editionId: edition.id,
      webSlug: 'test-slug-2',
      spec: {
        blocks: [
          { type: 'ARTICLE', content: { text: 'Секрет шефа!' } }
        ]
      },
      status: 'READY'
    }
  });

  console.log(`Created test issue with slug: ${issue.webSlug}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
