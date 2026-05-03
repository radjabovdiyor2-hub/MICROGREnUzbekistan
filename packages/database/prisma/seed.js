const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Microgreen database...');

  // Create categories
  const categories = await Promise.all([
    prisma.category.upsert({ where: { slug: 'mikrozelen' }, update: {}, create: { nameUz: 'Mikroko\'katlar', nameRu: 'Микрозелень', slug: 'mikrozelen', icon: 'leaf' } }),
    prisma.category.upsert({ where: { slug: 'salaty' }, update: {}, create: { nameUz: 'Salatlar', nameRu: 'Салаты', slug: 'salaty', icon: 'leaf' } }),
    prisma.category.upsert({ where: { slug: 'tsvety' }, update: {}, create: { nameUz: 'Gullar', nameRu: 'Цветы', slug: 'tsvety', icon: 'sparkles' } }),
    prisma.category.upsert({ where: { slug: 'semena' }, update: {}, create: { nameUz: 'Urug\'lar', nameRu: 'Семена', slug: 'semena', icon: 'droplet' } }),
    prisma.category.upsert({ where: { slug: 'substrat' }, update: {}, create: { nameUz: 'Substrat', nameRu: 'Субстрат', slug: 'substrat', icon: 'package' } }),
    prisma.category.upsert({ where: { slug: 'oborudovanie' }, update: {}, create: { nameUz: 'Uskunalar', nameRu: 'Оборудование', slug: 'oborudovanie', icon: 'plug' } }),
    prisma.category.upsert({ where: { slug: 'udobreniya' }, update: {}, create: { nameUz: 'O\'g\'itlar', nameRu: 'Удобрения', slug: 'udobreniya', icon: 'flask' } }),
    prisma.category.upsert({ where: { slug: 'nabory' }, update: {}, create: { nameUz: 'To\'plamlar', nameRu: 'Наборы', slug: 'nabory', icon: 'package' } }),
  ]);

  console.log(`✅ ${categories.length} categories created`);

  // Products data
  const products = [
    { nameUz: 'Quyoshqaboq mikroko\'kati', nameRu: 'Микрозелень подсолнечника', slug: 'podsolnechnik', price: 30000, oldPrice: 35000, categorySlug: 'mikrozelen', brand: 'Microgreen Uz', rating: 4.9, reviewCount: 124, isFeatured: true, isOnSale: true, stock: 45 },
    { nameUz: 'Rediska mikroko\'kati', nameRu: 'Микрозелень редиса', slug: 'redis', price: 25000, categorySlug: 'mikrozelen', brand: 'Microgreen Uz', rating: 4.8, reviewCount: 87, isFeatured: true, stock: 32 },
    { nameUz: 'Soya urug\'lari 1kg', nameRu: 'Семена сои 1кг', slug: 'semena-soi', price: 45000, categorySlug: 'semena', brand: 'AgroSeed', rating: 4.7, reviewCount: 56, stock: 150 },
    { nameUz: 'LED Fitolyampa 50W', nameRu: 'LED Фитолампа 50W', slug: 'led-fito-50w', price: 280000, oldPrice: 320000, categorySlug: 'oborudovanie', brand: 'GreenLight', rating: 4.9, reviewCount: 210, isFeatured: true, isOnSale: true, stock: 12 },
    { nameUz: 'Flora Series 3 qism', nameRu: 'Комплект Flora Series', slug: 'flora-series', price: 450000, categorySlug: 'udobreniya', brand: 'Terra Aquatica', rating: 4.8, reviewCount: 78, stock: 5 },
    { nameUz: 'Boshlang\'ich to\'plam', nameRu: 'Стартовый набор', slug: 'starter-kit', price: 150000, oldPrice: 180000, categorySlug: 'nabory', brand: 'Microgreen Uz', rating: 4.9, reviewCount: 98, isFeatured: true, isOnSale: true, stock: 25 },
    { nameUz: 'No\'xat mikroko\'kati', nameRu: 'Микрозелень гороха', slug: 'gorox', price: 28000, categorySlug: 'mikrozelen', brand: 'Microgreen Uz', rating: 4.7, reviewCount: 67, stock: 40 },
    { nameUz: 'Kokos substrati 5kg', nameRu: 'Кокосовый субстрат 5кг', slug: 'kokos-substrat', price: 55000, categorySlug: 'oborudovanie', brand: 'CocoPeat', rating: 4.6, reviewCount: 45, stock: 80 },
    { nameUz: 'Rukkola mikroko\'kati', nameRu: 'Микрозелень рукколы', slug: 'rukkola', price: 35000, oldPrice: 40000, categorySlug: 'mikrozelen', brand: 'Microgreen Uz', rating: 4.8, reviewCount: 52, isFeatured: true, isOnSale: true, stock: 20 },
  ];

  for (const p of products) {
    const cat = categories.find(c => c.slug === p.categorySlug);
    if (!cat) continue;

    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        nameUz: p.nameUz,
        nameRu: p.nameRu,
        slug: p.slug,
        price: p.price,
        oldPrice: p.oldPrice || null,
        categoryId: cat.id,
        brand: p.brand,
        rating: p.rating || 0,
        reviewCount: p.reviewCount || 0,
        isFeatured: p.isFeatured || false,
        isOnSale: p.isOnSale || false,
        isActive: true,
        stock: p.stock || 0,
        images: [],
      },
    });
  }

  console.log(`✅ ${products.length} products created`);
  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
