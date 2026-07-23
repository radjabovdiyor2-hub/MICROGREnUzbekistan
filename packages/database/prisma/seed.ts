import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Microgreen Uzbekistan store...');

  // ===== CATEGORIES =====
  const cats = await Promise.all([
    prisma.category.upsert({ where: { slug: 'microgreens' }, update: {}, create: { nameUz: "Mikroko'katlar", nameRu: 'Микрозелень', slug: 'microgreens', icon: 'Leaf', order: 1 }}),
    prisma.category.upsert({ where: { slug: 'baby-leaf' }, update: {}, create: { nameUz: 'Baby Leaf', nameRu: 'Бейби лист', slug: 'baby-leaf', icon: 'Leaf', order: 2 }}),
    prisma.category.upsert({ where: { slug: 'salads' }, update: {}, create: { nameUz: 'Salatlar', nameRu: 'Салаты', slug: 'salads', icon: 'Leaf', order: 3 }}),
    prisma.category.upsert({ where: { slug: 'flowers' }, update: {}, create: { nameUz: 'Gullar', nameRu: 'Цветы', slug: 'flowers', icon: 'Sparkles', order: 4 }}),
    prisma.category.upsert({ where: { slug: 'seeds' }, update: {}, create: { nameUz: "Urug'lar", nameRu: 'Семена', slug: 'seeds', icon: 'Droplet', order: 5 }}),
    prisma.category.upsert({ where: { slug: 'equipment' }, update: {}, create: { nameUz: 'Uskunalar', nameRu: 'Оборудование', slug: 'equipment', icon: 'Settings', order: 6 }}),
    prisma.category.upsert({ where: { slug: 'sets' }, update: {}, create: { nameUz: "To'plamlar", nameRu: 'Наборы', slug: 'sets', icon: 'Package', order: 7 }}),
  ]);
  const [micro, baby, salad, flower, seed, equip, sets] = cats;

  // ===== MICROGREENS — cost:8000, old:20000, price:15000 =====
  const microProducts = [
    { uz: "Rukkola mikroko'kati", ru: 'Микрозелень рукколы', slug: 'rukkola-micro', desc: "Keskin, yong'oqsimon ta'm. Salatlar, pitsa va sendvichlarga ideal" },
    { uz: "Bazilik mikroko'kati", ru: 'Микрозелень базилика', slug: 'bazilik-micro', desc: "Xushbo'y, shirin ta'm. Italyan oshxonasi uchun ajoyib" },
    { uz: "Brokkoli mikroko'kati", ru: 'Микрозелень брокколи', slug: 'brokkoli-micro', desc: "Sulforafanga boy — eng foydali mikroko'kat. Antioksidant" },
    { uz: "Redis mikroko'kati", ru: 'Микрозелень редиса', slug: 'redis-micro', desc: "Achchiq, o'tkir ta'm. Go'sht va baliq taomlariga" },
    { uz: "No'xat mikroko'kati", ru: 'Микрозелень гороха', slug: 'noxat-micro', desc: "Shirin, yangi ta'm. Bolalar ham yeydi. Oqsilga boy" },
    { uz: "Kungaboqar mikroko'kati", ru: 'Микрозелень подсолнечника', slug: 'kungaboqar-micro', desc: "Yong'oqsimon ta'm, oqsil va yog' kislotalarga boy" },
    { uz: "Quyoshqaboq mikroko'kati", ru: 'Микрозелень тыквы', slug: 'quyoshqaboq-micro', desc: "Noyob ta'm, sink va temirga boy. Immunitetni mustahkamlaydi" },
    { uz: "Bug'doy ko'kati (Vitgrass)", ru: 'Ростки пшеницы (Витграсс)', slug: 'bugdoy-vitgrass', desc: "Detox va energiya uchun. Smoothie va sharbatlarga" },
    { uz: "Arpa ko'kati", ru: 'Ростки ячменя', slug: 'arpa-kokati', desc: "Vitaminlar va minerallar xazinasi. ZOJ uchun ideal" },
    { uz: "Shpinat mikroko'kati", ru: 'Микрозелень шпината', slug: 'shpinat-micro', desc: "Temir va foliy kislotaga boy. Sog'lom ovqatlanish uchun" },
    { uz: "Karam mikroko'kati", ru: 'Микрозелень капусты', slug: 'karam-micro', desc: "Vitamin C ga boy, engil ta'm" },
    { uz: "Qizil karam mikroko'kati", ru: 'Микрозелень красной капусты', slug: 'qizil-karam-micro', desc: "Chiroyli binafsha rang, antosianinga boy" },
    { uz: "Beda mikroko'kati (Alfalfa)", ru: 'Микрозелень люцерны', slug: 'beda-alfalfa', desc: "Engil, yangi ta'm. Sendvich va salatlar uchun" },
    { uz: "Lavlagi mikroko'kati", ru: 'Микрозелень свёклы', slug: 'lavlagi-micro', desc: "Qizil rangdagi chiroyli ko'kat. Temirga boy" },
    { uz: "Mosh mikroko'kati", ru: 'Микрозелень маша', slug: 'mosh-micro', desc: "Oqsilga boy, Osiyo oshxonasi uchun ajoyib" },
    { uz: "Zig'ir mikroko'kati", ru: 'Микрозелень льна', slug: 'zigir-micro', desc: "Omega-3 ga boy. Sog'lom teri va soch uchun" },
    { uz: "Fenxel mikroko'kati", ru: 'Микрозелень фенхеля', slug: 'fenxel-micro', desc: "Anisga o'xshash xushbo'y ta'm. Baliq uchun ideal" },
    { uz: "Xantal mikroko'kati", ru: 'Микрозелень горчицы', slug: 'xantal-micro', desc: "O'tkir ta'm, go'sht taomlariga ajoyib qo'shimcha" },
    { uz: "Kinza mikroko'kati", ru: 'Микрозелень кинзы', slug: 'kinza-micro', desc: "O'ziga xos ta'm, Osiyo va Meksika oshxonasi uchun" },
    { uz: "Selderey mikroko'kati", ru: 'Микрозелень сельдерея', slug: 'selderey-micro', desc: "Yangi, xushbo'y ta'm. Kaloriyasi juda past" },
  ];

  for (const p of microProducts) {
    const imgPath = `/uploads/${p.slug}.png`;
    const defaultSpecs = {
      "O'sish vaqti / Срок выращивания": "7-10 kun / 7-10 дней",
      "Vitaminlar / Витамины": "A, B, C, E, K, Sulforaphane",
      "Minerallar / Минералы": "Кальций, Железо, Магний, Калий",
      "Ta'm / Вкус": "Yangi va sersuv / Свежий и сочный",
      "Foydasi / Полеза": "Immunitet, hazm qilish / Иммунитет, детоксикация",
      "Yaroqlilik muddati / Срок хранения": "7 kun (2-5°C) / 7 дней (2-5°C)"
    };
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: { price: 15000, oldPrice: 20000, costPrice: 8000, images: [imgPath], specs: defaultSpecs },
      create: {
        nameUz: p.uz, nameRu: p.ru, slug: p.slug,
        descriptionUz: p.desc, price: 15000, oldPrice: 20000, costPrice: 8000,
        categoryId: micro.id, stock: 50, brand: 'Microgreen UZ',
        isFeatured: true, isOnSale: true, images: [imgPath], specs: defaultSpecs,
      },
    });
  }
  console.log(`✅ ${microProducts.length} microgreens`);

  // ===== BABY LEAF — 35000/100g =====
  const babyProducts = [
    { uz: 'Baby Rukkola', ru: 'Бейби руккола', slug: 'baby-rukkola', desc: "Nozik rukkola barglari, 100g. Salatlar uchun ideal" },
    { uz: 'Baby Shpinat', ru: 'Бейби шпинат', slug: 'baby-shpinat', desc: "Yosh shpinat barglari, 100g. Smoothie va salatlarga" },
    { uz: 'Baby Karam (Kale)', ru: 'Бейби кейл', slug: 'baby-kale', desc: "Superfud kale barglari, 100g. Vitaminlarga to'la" },
    { uz: "Baby Mang'old", ru: 'Бейби мангольд', slug: 'baby-mangold', desc: "Rangli mang'old barglari, 100g. Dekor va ta'm" },
    { uz: 'Baby Chard Mix', ru: 'Бейби мангольд микс', slug: 'baby-chard-mix', desc: "Har xil rangli mang'old, 100g" },
    { uz: "Baby Ko'katlar Miksi", ru: 'Бейби микс', slug: 'baby-mix', desc: "Aralash baby leaf mix, 100g. 5+ turdagi barg" },
    { uz: 'Baby Mizuna', ru: 'Бейби мизуна', slug: 'baby-mizuna', desc: "Yapon salat bargi, 100g. Nozik, engil ta'm" },
    { uz: 'Baby Tat-soy', ru: 'Бейби тат-сой', slug: 'baby-tatsoy', desc: "Osiyo ko'kati, 100g. Stir-fry va salatlarga" },
  ];

  for (const p of babyProducts) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: { price: 35000, images: ['/uploads/cat_babyleaf.png'] },
      create: {
        nameUz: p.uz, nameRu: p.ru, slug: p.slug,
        descriptionUz: p.desc, price: 35000, costPrice: 15000,
        categoryId: baby.id, stock: 30, brand: 'Microgreen UZ',
        isFeatured: true, isOnSale: false, images: ['/uploads/cat_babyleaf.png'],
      },
    });
  }
  console.log(`✅ ${babyProducts.length} baby leaf`);

  // ===== SALADS — 35000/100g =====
  const saladProducts = [
    { uz: 'Salat Miksi Premium', ru: 'Салат микс премиум', slug: 'salat-mix-premium', desc: "Premium salat barglari aralashmasi, 100g" },
    { uz: "Lollo Rosso", ru: 'Лолло Россо', slug: 'lollo-rosso', desc: "Qizil jingalak salat, 100g. Restoran uchun ideal" },
    { uz: "Lollo Bionda", ru: 'Лолло Бионда', slug: 'lollo-bionda', desc: "Yashil jingalak salat, 100g" },
    { uz: "Frillis salat", ru: 'Фриллис салат', slug: 'frillis-salat', desc: "Frizli bargli salat, 100g. Dekorativ va mazali" },
    { uz: "Oakleaf Red", ru: 'Оаклиф красный', slug: 'oakleaf-red', desc: "Eman bargli qizil salat, 100g" },
    { uz: "Oakleaf Green", ru: 'Оаклиф зелёный', slug: 'oakleaf-green', desc: "Eman bargli yashil salat, 100g" },
    { uz: "Romaine salat", ru: 'Романо салат', slug: 'romaine-salat', desc: "Sezar salati uchun klassik, 100g" },
    { uz: "Batavia salat", ru: 'Батавия салат', slug: 'batavia-salat', desc: "Qalin, shirali barg, 100g" },
  ];

  for (const p of saladProducts) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: { price: 35000, images: ['/uploads/cat_salads.png'] },
      create: {
        nameUz: p.uz, nameRu: p.ru, slug: p.slug,
        descriptionUz: p.desc, price: 35000, costPrice: 15000,
        categoryId: salad.id, stock: 25, brand: 'Microgreen UZ',
        isFeatured: false, isOnSale: false, images: ['/uploads/cat_salads.png'],
      },
    });
  }
  console.log(`✅ ${saladProducts.length} salads`);

  // ===== FLOWERS — 35000/box (40-50 pcs) =====
  const flowerProducts = [
    { uz: "Atirgul (boks 40-50 dona)", ru: 'Розы (бокс 40-50 шт)', slug: 'atirgul-box', desc: "Premium atirgullar boksi, 40-50 dona" },
    { uz: "Pion (boks 40-50 dona)", ru: 'Пионы (бокс 40-50 шт)', slug: 'pion-box', desc: "Xushbo'y pionlar boksi, 40-50 dona" },
    { uz: "Lola (boks 40-50 dona)", ru: 'Тюльпаны (бокс 40-50 шт)', slug: 'lola-box', desc: "Bahoriy lolalar boksi, 40-50 dona" },
    { uz: "Xrizantema (boks 40-50 dona)", ru: 'Хризантемы (бокс 40-50 шт)', slug: 'xrizantema-box', desc: "Rangli xrizantemalar, 40-50 dona" },
    { uz: "Gerbera (boks 40-50 dona)", ru: 'Герберы (бокс 40-50 шт)', slug: 'gerbera-box', desc: "Yorqin gerberalar boksi, 40-50 dona" },
    { uz: "Gvozdika (boks 40-50 dona)", ru: 'Гвоздики (бокс 40-50 шт)', slug: 'gvozdika-box', desc: "Nafis gvozdikalar boksi, 40-50 dona" },
    { uz: "Lizianthus (boks 40-50 dona)", ru: 'Лизиантус (бокс 40-50 шт)', slug: 'lizianthus-box', desc: "Nozik lizianthuslar, 40-50 dona" },
    { uz: "Aralash gullar boksi", ru: 'Микс цветов (бокс)', slug: 'mixed-flowers-box', desc: "Har xil gullar miksi, 40-50 dona" },
  ];

  for (const p of flowerProducts) {
    const imgPath = `/uploads/${p.slug}.png`;
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: { price: 35000, images: [imgPath] },
      create: {
        nameUz: p.uz, nameRu: p.ru, slug: p.slug,
        descriptionUz: p.desc, price: 35000, costPrice: 12000,
        categoryId: flower.id, stock: 10, brand: 'Microgreen UZ',
        isFeatured: false, isOnSale: false, images: [imgPath],
      },
    });
  }
  console.log(`✅ ${flowerProducts.length} flowers`);

  // ===== SEEDS =====
  const seedProducts = [
    { uz: "Rukkola urug'i (50g)", ru: 'Семена рукколы (50г)', slug: 'seed-rukkola', price: 25000 },
    { uz: "Bazilik urug'i (50g)", ru: 'Семена базилика (50г)', slug: 'seed-bazilik', price: 25000 },
    { uz: "Brokkoli urug'i (50g)", ru: 'Семена брокколи (50г)', slug: 'seed-brokkoli', price: 30000 },
    { uz: "Redis urug'i (100g)", ru: 'Семена редиса (100г)', slug: 'seed-redis', price: 20000 },
    { uz: "Kungaboqar urug'i (200g)", ru: 'Семена подсолнечника (200г)', slug: 'seed-kungaboqar', price: 15000 },
    { uz: "No'xat urug'i (200g)", ru: 'Семена гороха (200г)', slug: 'seed-noxat', price: 12000 },
    { uz: "Bug'doy urug'i (500g)", ru: 'Семена пшеницы (500г)', slug: 'seed-bugdoy', price: 10000 },
    { uz: "Mosh urug'i (200g)", ru: 'Семена маша (200г)', slug: 'seed-mosh', price: 15000 },
  ];

  for (const p of seedProducts) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: { price: p.price, images: ['/uploads/cat_seeds.png'] },
      create: {
        nameUz: p.uz, nameRu: p.ru, slug: p.slug,
        price: p.price, costPrice: Math.round(p.price * 0.4),
        categoryId: seed.id, stock: 100, brand: 'Microgreen UZ',
        isFeatured: false, isOnSale: false, images: ['/uploads/cat_seeds.png'],
      },
    });
  }
  console.log(`✅ ${seedProducts.length} seeds`);

  // ===== EQUIPMENT =====
  const equipProducts = [
    { uz: "LED Fitolyampa 50W", ru: 'LED Фитолампа 50W', slug: 'led-fito-50w', price: 280000, cost: 180000, desc: "50W to'liq spektrli o'simliklar uchun LED lampa" },
    { uz: "LED Fitolyampa 100W", ru: 'LED Фитолампа 100W', slug: 'led-fito-100w', price: 450000, cost: 300000, desc: "100W professional fitolyampa. Katta maydon uchun" },
    { uz: "O'stirish javoni (3 qavat)", ru: 'Стеллаж для выращивания (3 яруса)', slug: 'javon-3-qavat', price: 850000, cost: 500000, desc: "3 qavatli metall javon. O'lcham: 120x50x150 sm" },
    { uz: "O'stirish javoni (5 qavat)", ru: 'Стеллаж для выращивания (5 ярусов)', slug: 'javon-5-qavat', price: 1200000, cost: 750000, desc: "5 qavatli professional javon. O'lcham: 120x60x200 sm" },
    { uz: "Avtomatik sug'orish taymer", ru: 'Автоматический таймер полива', slug: 'avto-taymer', price: 120000, cost: 60000, desc: "Raqamli taymer, 24 soat rejim. Sug'orishni avtomatlashtiradi" },
    { uz: "Substrat (kokos tolasi 5L)", ru: 'Субстрат (кокосовое волокно 5Л)', slug: 'substrat-kokos-5l', price: 35000, cost: 15000, desc: "Sifatli kokos tolasi substrat. 5 litr paket" },
    { uz: "Substrat (kokos tolasi 10L)", ru: 'Субстрат (кокосовое волокно 10Л)', slug: 'substrat-kokos-10l', price: 60000, cost: 25000, desc: "Sifatli kokos tolasi substrat. 10 litr paket" },
    { uz: "O'stirish patnis (50x25 sm)", ru: 'Лоток для выращивания (50x25 см)', slug: 'patnis-50x25', price: 25000, cost: 10000, desc: "Plastik o'stirish patnisi. Qayta ishlatiladi" },
    { uz: "Purkovchi (spray) 500ml", ru: 'Распылитель 500мл', slug: 'spray-500ml', price: 15000, cost: 5000, desc: "Qo'l purkagich. Muntazam suv berish uchun" },
    { uz: "Flora Series 3 qism", ru: 'Flora Series 3 компонента', slug: 'flora-series-3', price: 150000, cost: 90000, desc: "3 komponentli ozuqa eritmasi. Professional o'stirish uchun" },
  ];

  for (const p of equipProducts) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: { price: p.price, costPrice: p.cost, images: ['/uploads/cat_equipment.png'] },
      create: {
        nameUz: p.uz, nameRu: p.ru, slug: p.slug,
        descriptionUz: p.desc, price: p.price, oldPrice: Math.round(p.price * 1.2), costPrice: p.cost,
        categoryId: equip.id, stock: 15, brand: 'Microgreen UZ',
        isFeatured: true, isOnSale: false, images: ['/uploads/cat_equipment.png'],
      },
    });
  }
  console.log(`✅ ${equipProducts.length} equipment`);

  // ===== SETS (starter kits) =====
  const setProducts = [
    { uz: "Boshlang'ich to'plam", ru: 'Стартовый набор', slug: 'starter-kit', price: 150000, cost: 80000, desc: "3 turdagi urug' + substrat + patnis + qo'llanma. Yangi boshlovchilar uchun ideal" },
    { uz: "Professional to'plam", ru: 'Профессиональный набор', slug: 'pro-kit', price: 450000, cost: 250000, desc: "10 turdagi urug' + substrat + 2ta patnis + LED lampa + qo'llanma" },
    { uz: "Oilaviy to'plam", ru: 'Семейный набор', slug: 'family-kit', price: 250000, cost: 130000, desc: "5 turdagi urug' + substrat + 2ta patnis + bolalar uchun qo'llanma" },
    { uz: "HoReCa to'plam", ru: 'HoReCa набор', slug: 'horeca-kit', price: 750000, cost: 400000, desc: "Restoranlar uchun: 8 tur urug' + javon + substrat + lampa. Doimiy yetkazib berish bilan" },
    { uz: "Sovg'a to'plam Premium", ru: 'Подарочный набор Премиум', slug: 'gift-premium', price: 350000, cost: 180000, desc: "Chiroyli qutida: 5 tur urug' + mini patnis + substrat + sovg'a karta" },
    { uz: "Vitgrass to'plam", ru: 'Набор Витграсс', slug: 'vitgrass-kit', price: 120000, cost: 50000, desc: "Bug'doy urug'i + substrat + patnis + sharbat tayyorlash retseptlari" },
  ];

  for (const p of setProducts) {
    const imgPath = p.slug === 'smart-farm-set' ? '/uploads/smart-farm-set.png' : `/uploads/${p.slug}.png`;
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: { price: p.price, costPrice: p.cost, images: [imgPath] },
      create: {
        nameUz: p.uz, nameRu: p.ru, slug: p.slug,
        descriptionUz: p.desc, price: p.price, oldPrice: Math.round(p.price * 1.25), costPrice: p.cost,
        categoryId: sets.id, stock: 20, brand: 'Microgreen UZ',
        isFeatured: true, isOnSale: true, images: [imgPath],
      },
    });
  }
  console.log(`✅ ${setProducts.length} sets`);

  const total = microProducts.length + babyProducts.length + saladProducts.length + flowerProducts.length + seedProducts.length + equipProducts.length + setProducts.length;
  console.log(`\n🎉 Total: ${total} products seeded!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
