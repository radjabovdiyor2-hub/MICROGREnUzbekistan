import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🌿 Enriching all products with detailed specs, health benefits, and descriptions...');

  // Data map by slug for rich content
  const ENRICH_DATA: Record<string, {
    descUz: string;
    descRu: string;
    specs: Record<string, string>;
  }> = {
    // ===== MICROGREENS =====
    'rukkola-micro': {
      descUz: "Rukkola mikroko'kati — keskin, yong'oqsimon ta'mga ega bo'lib, oziq-ovqat moddalarining haqiqiy manbaidir. Tarkibidagi glyukozinolatlar saraton hujayralarining rivojlanishiga to'sqinlik qiladi, C va K vitaminlari esa immunitetni va suyak to'qimalarini mustahkamlaydi.",
      descRu: "Микрозелень рукколы обладает пикантным, орехово-горчичным вкусом и является настоящим концентратом полезных веществ. Глюкозинолаты в составе обладают выраженным онкопротекторным действием, а высокие дозы витаминов C и K укрепляют иммунитет и костную ткань.",
      specs: {
        "O'sish davri / Срок ротации": "7-9 kun / 7-9 дней",
        "Vitaminlar / Витамины": "A, B6, C, E, K, Folic acid",
        "Minerallar / Минералы": "Кальций, Железо, Магний, Калий",
        "Ta'm / Вкус": "Yong'oqsimon-achchiq / Орехово-горчичный",
        "Foydasi / Полеза": "Immunitet, oshqozon-ichak, antioksidant / Иммунитет, ЖКТ, онкопротекция",
        "Qiyinchilik / Сложность": "Oson / Легко",
        "Yaroqlilik muddati / Срок хранения": "7 kun (2-5°C) / 7 дней (2-5°C)"
      }
    },
    'bazilik-micro': {
      descUz: "Xushbo'y va shirin bazilik mikroko'kati italyan va o'rtayer dengizi taomlariga takrorlanmas ifor bag'ishlaydi. Efir moylariga va efir birikmalariga boy bo'lib, asab tizimini tinchlantiradi va ovqat hazm qilishni yaxshilaydi.",
      descRu: "Ароматная микрозелень базилика придаст изысканный пряный акцент салатам, пасте и пицце. Богата эфирными маслами и каротиноидами, способствует снижению стресса, улучшает пищеварение и обладает антибактериальным эффектом.",
      specs: {
        "O'sish davri / Срок ротации": "10-12 kun / 10-12 дней",
        "Vitaminlar / Витамины": "A, C, K, B2, PP",
        "Minerallar / Минералы": "Кальций, Железо, Медь, Марганец",
        "Ta'm / Вкус": "Pryaniy, shirin-ananasli / Пряный, анисово-сладковатый",
        "Foydasi / Полеза": "Asab tizimi, antibakterial / Стрессоустойчивость, антибактериальный",
        "Qiyinchilik / Сложность": "O'rta / Средняя",
        "Yaroqlilik muddati / Срок хранения": "6 kun / 6 дней"
      }
    },
    'brokkoli-micro': {
      descUz: "Brokkoli mikroko'kati tarkibidagi Sulforafan miqdori bo'yicha mutloq chempiondir (kattalar brokkolisidan 50 baravar ko'p). Sulforafan tanadagi toksinlarni chiqaradi, hujayralarni yoshartiradi va immun tizimini kuchaytiradi.",
      descRu: "Микрозелень брокколи — мировой лидер по содержанию сульфорафана (до 50 раз больше, чем во взрослой брокколи). Сульфорафан является мощнейшим природным антиоксидантом, стимулирует детоксикацию печени и защищает клетки от старения.",
      specs: {
        "O'sish davri / Срок ротации": "8-10 kun / 8-10 дней",
        "Vitaminlar / Витамины": "A, C, E, K, U, Sulforaphane",
        "Minerallar / Минералы": "Селен, Цинк, Кальций, Фосфор",
        "Ta'm / Вкус": "Nozik karamsimon / Нежный капустный",
        "Foydasi / Полеза": "Detox, hujayralar himoyasi / Мощный детокс, онкопротекция",
        "Qiyinchilik / Сложность": "Oson / Легко",
        "Yaroqlilik muddati / Срок хранения": "8 kun / 8 дней"
      }
    },
    'redis-micro': {
      descUz: "O'tkir va yangi ta'mga ega redis mikroko'kati ishtahani ochadi va taomlarga yorqin rang hamda maza bag'ishlaydi. Efir moylari va fitonsidlarga boy bo'lib, shamollashning oldini oladi.",
      descRu: "Яркая, хрустящая микрозелень редиса с характерной остринкой свежего редиса. Содержит высокую концентрацию эфирных масел и фитонцидов, улучшает обмен веществ и стимулирует пищеварение.",
      specs: {
        "O'sish davri / Срок ротации": "6-7 kun / 6-7 дней",
        "Vitaminlar / Витамины": "A, B1, B2, C, PP",
        "Minerallar / Минералы": "Калий, Кальций, Натрий, Железо",
        "Ta'm / Вкус": "O'tkir, achchiq-chuchuk / Острый, свеже-пикантный",
        "Foydasi / Полеза": "Moddalar almashinuvi, fitonsidlar / Обмен веществ, иммунитет",
        "Qiyinchilik / Сложность": "Juda oson / Очень легко",
        "Yaroqlilik muddati / Срок хранения": "7 kun / 7 дней"
      }
    },
    'noxat-micro': {
      descUz: "Shirin va sersuv no'xat maysalari bolalar va kattalarning sevimli ko'katidir. Oqsil, kletchatka va aminokislotalarga boy. Energiya darajasini oshiradi va qondagi shakar miqdorini normallashtiradi.",
      descRu: "Сладкие хрустящие побеги усиков гороха с вкусом свежего вылущенного зеленого горошка. Богаты растительным белком, клетчаткой и аминокислотами. Отличный источник энергии для спортсменов и детей.",
      specs: {
        "O'sish davri / Срок ротации": "10-14 kun / 10-14 дней",
        "Vitaminlar / Витамины": "A, B1, B6, C, E, PP",
        "Minerallar / Минералы": "Растительный белок, Клетчатка, Железо",
        "Ta'm / Вкус": "Shirin no'xat / Сладкий свежий горошек",
        "Foydasi / Полеза": "Muskullar va energiya / Белок для мышц и энергия",
        "Qiyinchilik / Сложность": "Oson / Легко",
        "Yaroqlilik muddati / Срок хранения": "10 kun / 10 дней"
      }
    },
    'kungaboqar-micro': {
      descUz: "Sersuv, yong'oqsimon kungaboqar maysalari mukammal amino-kislotalar balansiga ega. Yurak-qon tomir tizimini mustahkamlaydi, xolesterin darajasini tushiradi.",
      descRu: "Мясистые и сочные ростки подсолнечника с приятным ореховым послевкусием. Содержат все незаменимые аминокислоты, лецитин и ненасыщенные жирные кислоты Omega-6.",
      specs: {
        "O'sish davri / Срок ротации": "8-10 kun / 8-10 дней",
        "Vitaminlar / Витамины": "A, D, E, B-complex",
        "Minerallar / Минералы": "Лецитин, Омега-6, Цинк, Калий",
        "Ta'm / Вкус": "Yong'oqsimon, sersuv / Ореховый, сочный",
        "Foydasi / Полеза": "Yurak va qon tomirlar / Сердце, сосуды, лецитин",
        "Qiyinchilik / Сложность": "Oson / Легко",
        "Yaroqlilik muddati / Срок хранения": "8 kun / 8 дней"
      }
    },
    'quyoshqaboq-micro': {
      descUz: "Qovoq maysalari sink, temir va magniyning konidir. Erkaklar va ayollar salomatligi uchun o'ta foydali, qon bosimini va moddalar almashinuvini tartibga soladi.",
      descRu: "Микрозелень тыквы — ценный источник цинка, железа и магния. Поддерживает репродуктивное здоровье, укрепляет нервную систему и улучшает состояние кожи и волос.",
      specs: {
        "O'sish davri / Срок ротации": "10-12 kun / 10-12 дней",
        "Vitaminlar / Витамины": "A, B, C, E, K",
        "Minerallar / Минералы": "Цинк, Железо, Магний, Фосфор",
        "Ta'm / Вкус": "Yumshoq qovoqsimon / Мягкий тыквенный",
        "Foydasi / Полеза": "Sink, soch va teri / Цинк, репродуктивное здоровье",
        "Qiyinchilik / Сложность": "O'rta / Средняя",
        "Yaroqlilik muddati / Срок хранения": "7 kun / 7 дней"
      }
    },
    'bugdoy-vitgrass': {
      descUz: "Vitgrass bug'doy maysalari — 70% xlorofilldan iborat bo'lgan eng kuchli tabiiy eliksirdir. Qonni tozalaydi, gemoglobinni oshiradi va organizmni toksinlardan to'liq aritadi.",
      descRu: "Ростки пшеницы (Витграсс) — природный суперфуд, состоящий на 70% из чистого хлорофилла. Мощно очищает кровь, повышает гемоглобин, нейтрализует свободные радикалы.",
      specs: {
        "O'sish davri / Срок ротации": "10-12 kun / 10-12 дней",
        "Xlorofill / Хлорофилл": "70% toza xlorofill / 70% чистый хлорофилл",
        "Vitaminlar / Витамины": "A, C, E, K, B12",
        "Ta'm / Вкус": "Shirin-o'tsimon / Сладковато-травянистый",
        "Foydasi / Полеза": "Qonni tozalash, Gemoglobin / Детокс крови, Гемоглобин",
        "Qiyinchilik / Сложность": "Oson / Легко",
        "Yaroqlilik muddati / Срок хранения": "10 kun / 10 дней"
      }
    },
    'arpa-kokati': {
      descUz: "Arpa maysalari fermentlar, kletchatka va aminokislotalarga o'ta boy. Hazm qilishni yaxshilaydi, jigarni tozalaydi va quvvat beradi.",
      descRu: "Ростки ячменя содержат богатый спектр энзимов, аминокислот и антиоксидантов. Нормализуют работу печени, стимулируют метаболизм и заряжают бодростью.",
      specs: {
        "O'sish davri / Срок ротации": "9-11 kun / 9-11 дней",
        "Vitaminlar / Витамины": "B1, B2, B6, C, E",
        "Minerallar / Минералы": "Кальций, Железо, Натрий",
        "Ta'm / Вкус": "Tetiklantiruvchi o't / Освежающий травянистый",
        "Foydasi / Полеза": "Jigar tozalash, metabolizm / Печень, метаболизм",
        "Qiyinchilik / Сложность": "Oson / Легко",
        "Yaroqlilik muddati / Срок хранения": "8 kun / 8 дней"
      }
    },
    'shpinat-micro': {
      descUz: "Shpinat mikroko'kati foliy kislotasi va temir moddasining ajoyib manbaidir. Homilador ayollar, sportchilar va kamqonlik bilan kashf etilganlar uchun o'ta foydali.",
      descRu: "Микрозелень шпината — лидер по содержанию фолиевой кислоты и усвояемого железа. Незаменима для кроветворения, здоровья сердечно-сосудистой системы и нервной ткани.",
      specs: {
        "O'sish davri / Срок ротации": "10-12 kun / 10-12 дней",
        "Vitaminlar / Витамины": "A, C, E, K, B9 (Folic acid)",
        "Minerallar / Минералы": "Железо, Кальций, Йод, Омега-3",
        "Ta'm / Вкус": "Yumshoq, yangi / Нежный, нейтрально-свежий",
        "Foydasi / Полеза": "Qon ko'paytirish, Temir / Кроветворение, Железо",
        "Qiyinchilik / Сложность": "O'rta / Средняя",
        "Yaroqlilik muddati / Срок хранения": "7 kun / 7 дней"
      }
    },

    // ===== EQUIPMENT & KITS =====
    'led-fito-50w': {
      descUz: "50W to'liq fitospektrli professional LED lampa (PAR 380-780nm). O'simliklar fotosintezini 300% ga tezlashtiradi, mikroko'katlar va ko'katlar uchun ideal.",
      descRu: "Профессиональная светодиодная фитолампа мощностью 50 Вт с полным спектром (380-780 нм). Оптимизирована для ускорения фотосинтеза микрозелени, зелени и рассады.",
      specs: {
        "Quvvat / Мощность": "50W Full Spectrum",
        "Spektri / Спектр": "380nm - 780nm (PAR)",
        "Xizmat muddati / Срок службы": "50 000 soat / 50 000 часов",
        "Kafolat / Гарантия": "12 oy / 12 месяцев",
        "Energiya tejamkorlik / Энергоэффективность": "A++",
        "Qamrov maydoni / Зона покрытия": "0.8 - 1.2 m2"
      }
    },
    'starter-kit': {
      descUz: "Uyda mikroko'kat o'stirish uchun to'liq boshlang'ich to'plam. Tarkibida: 3 turdagi urug' (Redis, Brokkoli, No'xat), 3ta patnis, kokos substrati va rangli qo'llanma.",
      descRu: "Полный стартовый набор для выращивания свежей микрозелени на подоконнике. В комплекте: 3 вида семян (Редис, Брокколи, Горох), 3 лотка, кокосовые маты и пошаговая инструкция.",
      specs: {
        "To'plam tarkibi / Комплектация": "3 urug' + 3 patnis + substrat / 3 семян + 3 лотка + субстрат",
        "Hosil olish vaqti / Первый урожай": "7 kun / 7 дней",
        "Hosil hajmi / Урожайность": "300g+ yangi ko'kat / 300г+ зелени",
        "Moslik / Подходит для": "Yangi boshlovchilar va bolalar / Новичков и детей",
        "Qo'llanma / Инструкция": "QR-video + kitobcha / QR-видео + буклет"
      }
    }
  };

  // Generic generator for products not explicitly in ENRICH_DATA
  const products = await prisma.product.findMany({ include: { category: true } });

  let updatedCount = 0;
  for (const p of products) {
    const custom = ENRICH_DATA[p.slug];
    let specs: Record<string, string> = {};
    let descUz = p.descriptionUz;
    let descRu = p.descriptionRu;

    if (custom) {
      descUz = custom.descUz;
      descRu = custom.descRu;
      specs = custom.specs;
    } else {
      // Auto-generate high-quality specs by category
      if (p.category.slug === 'microgreens') {
        specs = {
          "O'sish davri / Срок ротации": "7-10 kun / 7-10 дней",
          "Vitaminlar / Витамины": "A, B, C, E, K, Antioksidantlar",
          "Minerallar / Минералы": "Кальций, Железо, Магний, Калий",
          "Ta'm / Вкус": "Yangi va xushbo'y / Свежий и насыщенный",
          "Foydasi / Полеза": "Immunitet, hazm qilish / Иммунитет, пищеварение",
          "Yaroqlilik muddati / Срок хранения": "7 kun (2-5°C) / 7 дней (2-5°C)"
        };
      } else if (p.category.slug === 'baby-leaf' || p.category.slug === 'salads') {
        specs = {
          "Netto vazni / Вес нетто": "100g / 100г",
          "Vitaminlar / Витамины": "A, C, K, Folic acid",
          "Saqlash harorati / Температура хранения": "2°C - 5°C",
          "Foydasi / Полеза": "Kletchatka, hazm qilish / Клетчатка, детокс",
          "Yaroqlilik muddati / Срок хранения": "5-7 kun / 5-7 дней"
        };
      } else if (p.category.slug === 'flowers') {
        specs = {
          "Hajmi / Объем": "Boks 40-50 dona / Бокс 40-50 шт",
          "Qo'llanilishi / Применение": "Restoran va desertlar dekoratsiyasi / Декор блюд и десертов",
          "Saqlash harorati / Температура хранения": "2°C - 6°C",
          "Yaroqlilik muddati / Срок хранения": "5 kun / 5 дней"
        };
      } else if (p.category.slug === 'seeds') {
        specs = {
          "Unuvchanligi / Всхожесть": "98%",
          "Tozaligi / Чистота": "99.5%",
          "Vazni / Вес": "50g - 200g / 50г - 200г",
          "Saqlash muddati / Срок годности": "24 oy / 24 месяца"
        };
      } else if (p.category.slug === 'equipment') {
        specs = {
          "Kafolat / Гарантия": "12 oy / 12 месяцев",
          "Material / Материал": "Professional eco-plastic / Alum",
          "Energiya tejamkorlik / Энергоэффективность": "A++",
          "Ishlab chiqaruvchi / Производитель": "Microgreen Uzbekistan"
        };
      } else if (p.category.slug === 'sets') {
        specs = {
          "To'plam / Комплектация": "To'liq tayyor to'plam / Полный готовый комплект",
          "Kafolat / Гарантия": "100% unish кафолати / 100% гарантия всхожести",
          "Qiyinchilik / Сложность": "Oson / Легко",
          "Qo'llanma / Инструкция": "Mavjud / В комплекте"
        };
      }
    }

    await prisma.product.update({
      where: { id: p.id },
      data: {
        descriptionUz: descUz,
        descriptionRu: descRu,
        specs: specs,
      }
    });
    updatedCount++;
  }

  console.log(`✅ Successfully enriched all ${updatedCount} products in the database!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
