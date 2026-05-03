const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🖼️  Updating product images...');

  const imageMap = {
    'grohe-eurosmart': ['/products/grohe-eurosmart.png'],
    'hansgrohe-focus': ['/products/hansgrohe-focus.png'],
    'ideal-standard-unitaz': ['/products/ideal-standard-unitaz.png'],
    'vitra-s50': ['/products/vitra-s50.png'],
    'cersanit-carina-60': ['/products/cersanit-carina-60.png'],
    'bosch-gsb': ['/products/bosch-gsb.png'],
    'stanley-hammer-500': ['/products/stanley-hammer-500.png'],
    'makita-df330': ['/products/makita-df330.png'],
    'philips-led-12w': ['/products/philips-led-12w.png'],
    'schneider-rozetka': ['/products/schneider-rozetka.png'],
    'ceresit-cs25': ['/products/ceresit-cs25.png'],
    'dulux-3l-white': ['/products/dulux-3l-white.png'],
    'dush-shlang-150': ['/products/dush-shlang-150.png'],
    'led-mirror-60x80': ['/products/led-mirror-60x80.png'],
    'aquaphor-filter': ['/products/aquaphor-filter.png'],
    'garden-hose-20m': ['/products/garden-hose-20m.png'],
    'chelak-10l': ['/products/chelak-10l.png'],
    'mop-professional': ['/products/mop-professional.png'],
  };

  let count = 0;
  for (const [slug, images] of Object.entries(imageMap)) {
    await prisma.product.update({
      where: { slug },
      data: { images },
    });
    count++;
  }

  console.log(`✅ Updated ${count} product images`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
