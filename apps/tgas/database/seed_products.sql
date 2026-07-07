-- ============================================================================
-- Microgreen Uzbekistan — Начальные данные каталога продукции
-- Все цены в UZS (узбекский сум)
-- ============================================================================

-- ============================================================================
-- МИКРОЗЕЛЕНЬ (microgreens) — цена за 100 г
-- ============================================================================
INSERT INTO products (name_uz, name_ru, category, price, old_price, unit, stock_qty, min_order_qty, description_uz, description_ru, nutrition_info, sort_order)
VALUES
(
    'Mikroyashil rukkola', 'Микрозелень руккола', 'microgreens',
    55000, NULL, 'g', 500, 50,
    'Rukkola mikroyashili — o''tkir va yong''oqli ta''m. Salatlarga, pitsa va go''shtga ideal mos keladi.',
    'Микрозелень рукколы — острый ореховый вкус. Идеально подходит для салатов, пиццы и мясных блюд.',
    '{"calories_per_100g": 25, "protein_g": 2.6, "fiber_g": 1.6, "vitamin_c_mg": 15, "vitamin_k_mcg": 109}',
    10
),
(
    'Mikroyashil rayhon', 'Микрозелень базилик', 'microgreens',
    60000, NULL, 'g', 400, 50,
    'Rayhon mikroyashili — xushbo''y hid va yoqimli ta''m. Italyan va O''zbek oshxonasi uchun.',
    'Микрозелень базилика — ароматный вкус. Для итальянской и узбекской кухни.',
    '{"calories_per_100g": 23, "protein_g": 3.2, "fiber_g": 1.6, "vitamin_a_iu": 5275, "vitamin_k_mcg": 415}',
    20
),
(
    'Mikroyashil ismaloq', 'Микрозелень шпинат', 'microgreens',
    50000, NULL, 'g', 600, 50,
    'Ismaloq mikroyashili — yumshoq ta''m, vitaminlarga boy. Smoothie va salatlarga.',
    'Микрозелень шпината — мягкий вкус, богата витаминами. Для смузи и салатов.',
    '{"calories_per_100g": 23, "protein_g": 2.9, "fiber_g": 2.2, "iron_mg": 2.7, "vitamin_c_mg": 28}',
    30
),
(
    'Mikroyashil brokkoli', 'Микрозелень брокколи', 'microgreens',
    65000, 75000, 'g', 350, 50,
    'Brokkoli mikroyashili — eng foydali superfood. Sulforafanga boy.',
    'Микрозелень брокколи — самый полезный суперфуд. Богата сульфорафаном.',
    '{"calories_per_100g": 34, "protein_g": 2.8, "fiber_g": 2.6, "sulforaphane_mg": 73, "vitamin_c_mg": 89}',
    40
),
(
    'Mikroyashil turp', 'Микрозелень редис', 'microgreens',
    45000, NULL, 'g', 700, 50,
    'Turp mikroyashili — o''tkir ta''m, go''sht va baliq taomlariga mos.',
    'Микрозелень редиса — острый вкус, отлично подходит к мясу и рыбе.',
    '{"calories_per_100g": 16, "protein_g": 2.5, "fiber_g": 1.6, "vitamin_c_mg": 29, "folate_mcg": 38}',
    50
),
(
    'Mikroyashil no''xat', 'Микрозелень горох', 'microgreens',
    40000, NULL, 'g', 800, 50,
    'No''xat mikroyashili — shirin ta''m, bolalarga ham yoqadi.',
    'Микрозелень гороха — сладкий вкус, нравится даже детям.',
    '{"calories_per_100g": 42, "protein_g": 3.5, "fiber_g": 2.0, "vitamin_c_mg": 40, "vitamin_a_iu": 1087}',
    60
),
(
    'Mikroyashil kungaboqar', 'Микрозелень подсолнечник', 'microgreens',
    48000, NULL, 'g', 550, 50,
    'Kungaboqar mikroyashili — yong''oqli ta''m va qaytiq tuzilish.',
    'Микрозелень подсолнечника — ореховый вкус и хрустящая текстура.',
    '{"calories_per_100g": 45, "protein_g": 3.8, "fiber_g": 2.1, "vitamin_e_mg": 7.4, "zinc_mg": 1.1}',
    70
),
(
    'Mikroyashil kress-salat', 'Микрозелень кресс-салат', 'microgreens',
    52000, NULL, 'g', 450, 50,
    'Kress-salat mikroyashili — o''tkir ta''m, oshqozon uchun foydali.',
    'Микрозелень кресс-салата — пикантный вкус, полезна для пищеварения.',
    '{"calories_per_100g": 32, "protein_g": 2.6, "fiber_g": 1.1, "vitamin_c_mg": 69, "vitamin_a_iu": 6917}',
    80
),
(
    'Mikroyashil kashnich', 'Микрозелень кинза', 'microgreens',
    58000, NULL, 'g', 380, 50,
    'Kashnich mikroyashili — o''zbekona ta''m, osh va salatlarga.',
    'Микрозелень кинзы — традиционный вкус, идеальна для плова и салатов.',
    '{"calories_per_100g": 23, "protein_g": 2.1, "fiber_g": 2.8, "vitamin_c_mg": 27, "vitamin_k_mcg": 310}',
    90
),
(
    'Mikroyashil lavlagi', 'Микрозелень свёкла', 'microgreens',
    62000, NULL, 'g', 320, 50,
    'Lavlagi mikroyashili — chiroyli pushti rang va shirin ta''m.',
    'Микрозелень свёклы — красивый розовый цвет и сладковатый вкус.',
    '{"calories_per_100g": 22, "protein_g": 2.4, "fiber_g": 2.0, "iron_mg": 3.5, "folate_mcg": 109}',
    100
);

-- ============================================================================
-- БЭБИ-ЛИФ (baby-leaf) — цена за 100 г
-- ============================================================================
INSERT INTO products (name_uz, name_ru, category, price, old_price, unit, stock_qty, min_order_qty, description_uz, description_ru, sort_order)
VALUES
(
    'Bebi-lif rukkola', 'Руккола бейби', 'baby-leaf',
    45000, NULL, 'g', 400, 50,
    'Yosh rukkola barglari — salatlarga ideal.',
    'Молодые листья рукколы — идеальны для салатов.',
    110
),
(
    'Bebi-lif ismaloq', 'Шпинат бейби', 'baby-leaf',
    40000, NULL, 'g', 500, 50,
    'Yosh ismaloq barglari — yumshoq va foydali.',
    'Молодые листья шпината — нежные и полезные.',
    120
),
(
    'Bebi-lif mangold', 'Мангольд бейби', 'baby-leaf',
    55000, 60000, 'g', 300, 50,
    'Mangold yosh barglari — rangli va mazali.',
    'Молодые листья мангольда — красочные и вкусные.',
    130
);

-- ============================================================================
-- САЛАТЫ (salads) — цена за 200 г
-- ============================================================================
INSERT INTO products (name_uz, name_ru, category, price, old_price, unit, stock_qty, min_order_qty, description_uz, description_ru, sort_order)
VALUES
(
    'Miks salat', 'Микс салат', 'salads',
    65000, NULL, 'g', 300, 100,
    'Mikroyashillar aralashmasi — turli xil ta''m va rang.',
    'Микс из микрозелени — разнообразие вкусов и цветов. Упаковка 200 г.',
    200
),
(
    'Rukkola salat', 'Руккола салат', 'salads',
    75000, NULL, 'g', 250, 100,
    'Rukkola salat aralashmasi — HoReCa uchun ideal.',
    'Салатный микс на основе рукколы — идеален для HoReCa. Упаковка 200 г.',
    210
),
(
    'Vitaminli miks', 'Витаминный микс', 'salads',
    85000, 90000, 'g', 200, 100,
    'Eng foydali mikroyashillardan maxsus vitaminli aralashma.',
    'Специальный витаминный микс из самых полезных микрозеленей. Упаковка 200 г.',
    220
);

-- ============================================================================
-- СЪЕДОБНЫЕ ЦВЕТЫ (flowers) — цена за 30 г
-- ============================================================================
INSERT INTO products (name_uz, name_ru, category, price, old_price, unit, stock_qty, min_order_qty, description_uz, description_ru, sort_order)
VALUES
(
    'Yeyiladigan gullar miksi', 'Съедобные цветы микс', 'flowers',
    80000, NULL, 'g', 150, 15,
    'Turli xil yeyiladigan gullarning chiroyli aralashmasi. Taomlarni bezash uchun.',
    'Красивый микс из различных съедобных цветов. Для декорирования блюд. Упаковка 30 г.',
    300
),
(
    'Nastursiya gullari', 'Цветы настурции', 'flowers',
    70000, NULL, 'g', 120, 15,
    'Nastursiya gullari — o''tkir ta''m va yorqin rang.',
    'Цветы настурции — острый вкус и яркий цвет. Упаковка 30 г.',
    310
),
(
    'Borago gullari', 'Цветы бораго', 'flowers',
    90000, 100000, 'g', 100, 15,
    'Borago gullari — ko''k rang va bodring ta''mi.',
    'Цветы бораго — голубой цвет и огуречный вкус. Упаковка 30 г.',
    320
);

-- ============================================================================
-- СЕМЕНА (seeds) — цена за упаковку
-- ============================================================================
INSERT INTO products (name_uz, name_ru, category, price, old_price, unit, stock_qty, min_order_qty, description_uz, description_ru, sort_order)
VALUES
(
    'Rukkola urug''lari', 'Семена рукколы', 'seeds',
    35000, NULL, 'pack', 200, 1,
    'Rukkola urug''lari — uyda o''stirish uchun. 50 g paket.',
    'Семена рукколы для домашнего выращивания. Пакет 50 г.',
    400
),
(
    'Kungaboqar urug''lari', 'Семена подсолнечника', 'seeds',
    30000, NULL, 'pack', 250, 1,
    'Kungaboqar urug''lari — tez unib chiqadi. 100 g paket.',
    'Семена подсолнечника — быстрая всхожесть. Пакет 100 г.',
    410
),
(
    'No''xat urug''lari', 'Семена гороха', 'seeds',
    25000, NULL, 'pack', 300, 1,
    'No''xat urug''lari — boshlang''ichlar uchun eng oson. 100 g paket.',
    'Семена гороха — самый простой вариант для начинающих. Пакет 100 г.',
    420
),
(
    'Urug''lar to''plami', 'Набор семян', 'seeds',
    80000, 95000, 'pack', 100, 1,
    '5 xil urug'' to''plami: rukkola, turp, no''xat, kungaboqar, brokkoli.',
    'Набор из 5 видов семян: руккола, редис, горох, подсолнечник, брокколи.',
    430
);

-- ============================================================================
-- СУБСТРАТ (substrate) — цена за единицу/упаковку
-- ============================================================================
INSERT INTO products (name_uz, name_ru, category, price, old_price, unit, stock_qty, min_order_qty, description_uz, description_ru, sort_order)
VALUES
(
    'Kokos substrati', 'Кокосовый субстрат', 'substrate',
    45000, NULL, 'piece', 150, 1,
    'Kokos substrat bloki — 5 litr. Mikroyashil o''stirish uchun ideal.',
    'Кокосовый субстрат в брикетах — 5 литров. Идеален для микрозелени.',
    500
),
(
    'Torf tabletkalar', 'Торфяные таблетки', 'substrate',
    35000, NULL, 'pack', 200, 1,
    'Torf tabletkalar to''plami — 50 dona. Urug'' undirishda qulay.',
    'Набор торфяных таблеток — 50 шт. Удобны для проращивания семян.',
    510
),
(
    'Mineral paxta', 'Минеральная вата', 'substrate',
    150000, NULL, 'pack', 80, 1,
    'Gidroponika uchun mineral paxta matlari — 10 dona.',
    'Маты из минеральной ваты для гидропоники — 10 шт.',
    520
);

-- ============================================================================
-- ОБОРУДОВАНИЕ (equipment) — цена за единицу
-- ============================================================================
INSERT INTO products (name_uz, name_ru, category, price, old_price, unit, stock_qty, min_order_qty, description_uz, description_ru, sort_order)
VALUES
(
    'Undirgich lotok', 'Лоток для проращивания', 'equipment',
    55000, NULL, 'piece', 100, 1,
    'Plastik lotok qopqoq bilan — 30×20 sm. Mikroyashil o''stirish uchun.',
    'Пластиковый лоток с крышкой — 30×20 см. Для выращивания микрозелени.',
    600
),
(
    'LED fitolamp', 'LED фитолампа', 'equipment',
    350000, 400000, 'piece', 30, 1,
    'LED fitolamp — to''liq spektr, 30W. O''simliklar uchun ideal yorug''lik.',
    'LED фитолампа — полный спектр, 30W. Идеальный свет для растений.',
    610
),
(
    'Mini gidroponik tizim', 'Гидропонная система мини', 'equipment',
    850000, 950000, 'piece', 15, 1,
    'Uyda ishlatish uchun mini gidroponik tizim — 12 o''rinli.',
    'Мини гидропонная система для дома — 12 посадочных мест.',
    620
),
(
    'Aeroponik qurilma', 'Аэропонная установка', 'equipment',
    1800000, 2000000, 'piece', 5, 1,
    'Professional aeroponik qurilma — 24 o''rinli, avtomatik boshqaruv.',
    'Профессиональная аэропонная установка — 24 места, автоматическое управление.',
    630
);

-- ============================================================================
-- НАБОРЫ (sets) — цена за комплект
-- ============================================================================
INSERT INTO products (name_uz, name_ru, category, price, old_price, unit, stock_qty, min_order_qty, description_uz, description_ru, sort_order)
VALUES
(
    'Boshlang''ich to''plam', 'Стартовый набор', 'sets',
    250000, 300000, 'set', 40, 1,
    'Mikroyashil o''stirishni boshlash uchun to''liq to''plam: 3 xil urug'', 3 lotok, substrat, ko''rsatma.',
    'Полный набор для старта: 3 вида семян, 3 лотка, субстрат, инструкция по выращиванию.',
    700
),
(
    '"Restorator" to''plami', 'Набор "Ресторатор"', 'sets',
    850000, 1000000, 'set', 10, 1,
    'Restoranlar uchun professional to''plam: 6 xil urug'', 12 lotok, substrat, LED lamp, o''stirish qo''llanmasi.',
    'Профессиональный набор для ресторанов: 6 видов семян, 12 лотков, субстрат, LED лампа, руководство.',
    710
),
(
    '"Uy fermasi" to''plami', 'Набор "Домашняя ферма"', 'sets',
    1400000, 1500000, 'set', 8, 1,
    'To''liq uy fermasi: mini gidroponik tizim, LED lamp, 5 xil urug'', substrat, to''liq video kurs.',
    'Полная домашняя ферма: мини гидропонная система, LED лампа, 5 видов семян, субстрат, полный видеокурс.',
    720
);

-- ============================================================================
-- Начальные данные загружены: 30 товаров в 8 категориях
-- ============================================================================
