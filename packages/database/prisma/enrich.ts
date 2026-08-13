import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════════════
// Описания и характеристики товаров витрины.
//
// ЗДЕСЬ НЕТ ЗАЯВЛЕНИЙ О ЛЕЧЕБНЫХ СВОЙСТВАХ
//
// Раньше в описаниях стояло «онкопротекторное действие», «стимулирует
// детоксикацию печени», «нормализует уровень сахара в крови», «снижает
// холестерин», «до 50 раз больше сульфорафана», «70% чистого хлорофилла».
// Сведения о лечебных и оздоровительных свойствах продукта требуют разрешения
// Минздрава РУз и агентства «Узстандарт» — его нет; протоколов испытаний,
// подтверждающих цифры, тоже нет.
//
// Правило: пишем ВКУС, ПРИМЕНЕНИЕ и СОСТАВ. Не пишем, что продукт делает с
// организмом. Ключ спецификации «Foydasi / Полеза» («польза») по этой же
// причине заменён на «Tarkibida / В составе».
// ══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('🌿 Enriching all products with descriptions and composition specs...');

  // Data map by slug for rich content
  const ENRICH_DATA: Record<string, {
    descUz: string;
    descRu: string;
    specs: Record<string, string>;
  }> = {
    // ===== MICROGREENS =====
    'rukkola-micro': {
      descUz: "Rukkola mikroko'kati — keskin, yong'oqsimon-achchiq ta'mli barg. Salat, pitsa va sendvichlarga yorqin nota beradi. Tarkibida glyukozinolatlar, C va K vitaminlari.",
      descRu: "Микрозелень рукколы с пикантным орехово-горчичным вкусом. Даёт яркий акцент салатам, пасте и пицце. В составе — глюкозинолаты, витамины C и K.",
      specs: {
        "O'sish davri / Срок ротации": "7-9 kun / 7-9 дней",
        "Vitaminlar / Витамины": "A, B6, C, E, K, Folic acid",
        "Minerallar / Минералы": "Кальций, Железо, Магний, Калий",
        "Ta'm / Вкус": "Yong'oqsimon-achchiq / Орехово-горчичный",
        "Tarkibida / В составе": "C vitamini 97 mg / 100 g / Витамин C 97 мг на 100 г",
        "Qiyinchilik / Сложность": "Oson / Легко",
        "Yaroqlilik muddati / Срок хранения": "7 kun (2-5°C) / 7 дней (2-5°C)"
      }
    },
    'bazilik-micro': {
      descUz: "Xushbo'y va shirin bazilik mikroko'kati italyan va o'rtayer dengizi taomlariga takrorlanmas ifor bag'ishlaydi. Efir moylari va karotinoidlarga boy.",
      descRu: "Ароматная микрозелень базилика придаст изысканный пряный акцент салатам, пасте и пицце. Богата эфирными маслами и каротиноидами.",
      specs: {
        "O'sish davri / Срок ротации": "10-12 kun / 10-12 дней",
        "Vitaminlar / Витамины": "A, C, K, B2, PP",
        "Minerallar / Минералы": "Кальций, Железо, Медь, Марганец",
        "Ta'm / Вкус": "Pryaniy, shirin-ananasli / Пряный, анисово-сладковатый",
        "Tarkibida / В составе": "Assortimentda eng ko'p A vitamini / Больше всего витамина A в ассортименте",
        "Qiyinchilik / Сложность": "O'rta / Средняя",
        "Yaroqlilik muddati / Срок хранения": "6 kun / 6 дней"
      }
    },
    'brokkoli-micro': {
      descUz: "Brokkoli mikroko'kati — nozik karamsimon ta'm, achchiqsiz. Glyukozinolatlar (sulforafan prekursorlari) manbai. Issiqlikka tutmang: 70 °C dan yuqorida mirozinaza parchalanadi.",
      descRu: "Микрозелень брокколи с нежным капустным вкусом без горечи. Источник глюкозинолатов — предшественников сульфорафана. Не нагревать: выше 70 °C мирозиназа разрушается.",
      specs: {
        "O'sish davri / Срок ротации": "8-10 kun / 8-10 дней",
        "Vitaminlar / Витамины": "A, C, E, K",
        "Minerallar / Минералы": "Селен, Цинк, Кальций, Фосфор",
        "Ta'm / Вкус": "Nozik karamsimon / Нежный капустный",
        "Tarkibida / В составе": "Glyukozinolatlar, tolalar 2.6 g / Глюкозинолаты, клетчатка 2.6 г на 100 г",
        "Qiyinchilik / Сложность": "Oson / Легко",
        "Yaroqlilik muddati / Срок хранения": "8 kun / 8 дней"
      }
    },
    'redis-micro': {
      descUz: "O'tkir va yangi ta'mga ega redis mikroko'kati taomlarga yorqin rang va keskin nota bag'ishlaydi. Efir moylariga boy, poyasi qarsildoq.",
      descRu: "Яркая, хрустящая микрозелень редиса с характерной остринкой свежего редиса. Содержит эфирные масла, даёт резкий вкусовой акцент мясу и рыбе.",
      specs: {
        "O'sish davri / Срок ротации": "6-7 kun / 6-7 дней",
        "Vitaminlar / Витамины": "A, B1, B2, C, PP",
        "Minerallar / Минералы": "Калий, Кальций, Натрий, Железо",
        "Ta'm / Вкус": "O'tkir, achchiq-chuchuk / Острый, свеже-пикантный",
        "Tarkibida / В составе": "Temir 2.2 mg, E vitamini 2.4 mg / Железо 2.2 мг, витамин E 2.4 мг на 100 г",
        "Qiyinchilik / Сложность": "Juda oson / Очень легко",
        "Yaroqlilik muddati / Срок хранения": "7 kun / 7 дней"
      }
    },
    'noxat-micro': {
      descUz: "Shirin va sersuv no'xat maysalari bolalar va kattalarning sevimli ko'katidir. Assortimentdagi eng oqsilli mahsulot — 100 g da 4.2 g oqsil.",
      descRu: "Сладкие хрустящие побеги гороха со вкусом свежего вылущенного горошка. Самый белковый продукт в ассортименте — 4.2 г белка на 100 г.",
      specs: {
        "O'sish davri / Срок ротации": "10-14 kun / 10-14 дней",
        "Vitaminlar / Витамины": "A, B1, B6, C, E, PP",
        "Minerallar / Минералы": "Железо, Калий, Магний",
        "Ta'm / Вкус": "Shirin no'xat / Сладкий свежий горошек",
        "Tarkibida / В составе": "Oqsil 4.2 g, tolalar 2.3 g / Белок 4.2 г, клетчатка 2.3 г на 100 г",
        "Qiyinchilik / Сложность": "Oson / Легко",
        "Yaroqlilik muddati / Срок хранения": "10 kun / 10 дней"
      }
    },
    'kungaboqar-micro': {
      descUz: "Sersuv, yong'oqsimon kungaboqar maysalari — zich poya va to'q ta'm. Tarkibida yog' kislotalari va assortimentdagi eng ko'p E vitamini.",
      descRu: "Мясистые и сочные ростки подсолнечника с ореховым послевкусием и плотным стеблем. В составе — ненасыщенные жирные кислоты и максимум витамина E в ассортименте.",
      specs: {
        "O'sish davri / Срок ротации": "8-10 kun / 8-10 дней",
        "Vitaminlar / Витамины": "A, E, B-complex",
        "Minerallar / Минералы": "Цинк, Калий, Магний",
        "Ta'm / Вкус": "Yong'oqsimon, sersuv / Ореховый, сочный",
        "Tarkibida / В составе": "E vitamini 4.4 mg, yog' 1.4 g / Витамин E 4.4 мг, жиры 1.4 г на 100 г",
        "Qiyinchilik / Сложность": "Oson / Легко",
        "Yaroqlilik muddati / Срок хранения": "8 kun / 8 дней"
      }
    },
    'quyoshqaboq-micro': {
      descUz: "Qovoq maysalari — yumshoq qovoqsimon ta'm. Sink, temir va magniyga boy.",
      descRu: "Микрозелень тыквы с мягким тыквенным вкусом. В составе — цинк, железо и магний.",
      specs: {
        "O'sish davri / Срок ротации": "10-12 kun / 10-12 дней",
        "Vitaminlar / Витамины": "A, B, C, E, K",
        "Minerallar / Минералы": "Цинк, Железо, Магний, Фосфор",
        "Ta'm / Вкус": "Yumshoq qovoqsimon / Мягкий тыквенный",
        "Tarkibida / В составе": "Sink, temir, magniy / Цинк, железо, магний",
        "Qiyinchilik / Сложность": "O'rta / Средняя",
        "Yaroqlilik muddati / Срок хранения": "7 kun / 7 дней"
      }
    },
    'bugdoy-vitgrass': {
      descUz: "Vitgrass bug'doy maysalari — shirin-o'tsimon ta'm, sharbat va smuzi uchun. Xlorofillga boy yashil massa.",
      descRu: "Ростки пшеницы (Витграсс) со сладковато-травянистым вкусом. Используются для соков и смузи. Зелёная масса, богатая хлорофиллом.",
      specs: {
        "O'sish davri / Срок ротации": "10-12 kun / 10-12 дней",
        "Vitaminlar / Витамины": "A, C, E, K",
        "Ta'm / Вкус": "Shirin-o'tsimon / Сладковато-травянистый",
        "Tarkibida / В составе": "Xlorofill, tolalar / Хлорофилл, клетчатка",
        "Qo'llanilishi / Применение": "Sharbat, smuzi / Соки, смузи",
        "Qiyinchilik / Сложность": "Oson / Легко",
        "Yaroqlilik muddati / Срок хранения": "10 kun / 10 дней"
      }
    },
    'arpa-kokati': {
      descUz: "Arpa maysalari — tetiklantiruvchi o'tsimon ta'm. Tarkibida aminokislotalar, kletchatka va antioksidantlar.",
      descRu: "Ростки ячменя с освежающим травянистым вкусом. В составе — аминокислоты, клетчатка и антиоксиданты.",
      specs: {
        "O'sish davri / Срок ротации": "9-11 kun / 9-11 дней",
        "Vitaminlar / Витамины": "B1, B2, B6, C, E",
        "Minerallar / Минералы": "Кальций, Железо, Натрий",
        "Ta'm / Вкус": "Tetiklantiruvchi o't / Освежающий травянистый",
        "Tarkibida / В составе": "Aminokislotalar, kletchatka / Аминокислоты, клетчатка",
        "Qiyinchilik / Сложность": "Oson / Легко",
        "Yaroqlilik muddati / Срок хранения": "8 kun / 8 дней"
      }
    },
    'shpinat-micro': {
      descUz: "Shpinat mikroko'kati — yumshoq, neytral ta'm. Foliy kislotasi va temirga boy.",
      descRu: "Микрозелень шпината с нежным нейтральным вкусом. В составе — фолиевая кислота и железо.",
      specs: {
        "O'sish davri / Срок ротации": "10-12 kun / 10-12 дней",
        "Vitaminlar / Витамины": "A, C, E, K, B9 (Folic acid)",
        "Minerallar / Минералы": "Железо, Кальций, Магний",
        "Ta'm / Вкус": "Yumshoq, yangi / Нежный, нейтрально-свежий",
        "Tarkibida / В составе": "Temir, B9 folat / Железо, фолиевая кислота",
        "Qiyinchilik / Сложность": "O'rta / Средняя",
        "Yaroqlilik muddati / Срок хранения": "7 kun / 7 дней"
      }
    },

    // ═════════ BALANS — миксы 100 г и киты ═════════
    // Нутриенты рассчитаны по долям культур в миксе из NUTRITION_DB
    // (apps/web/src/lib/nutrition/nutritionDb.ts), а не измерены в лаборатории.
    // Так и подписано в спецификации — «Расчёт по составу»: без протокола
    // испытаний выдавать цифру за измеренную нельзя.
    'balans-yumshoq': {
      descUz: "No'xat, kungaboqar, tatsoy, mizuna va brokkoli. Achchiqsiz yumshoq ta'm — ko'katga o'rganmaganlar uchun boshlanish nuqtasi. Tayyor 100 g qadoq, yuvish shart emas.",
      descRu: "Горох, подсолнечник, татсой, мизуна и брокколи. Мягкий вкус без горечи — точка входа для тех, кто к зелени не привык. Готовая упаковка 100 г, мыть не нужно.",
      specs: {
        "Netto / Нетто": "100 g",
        "Tarkibi / Состав": "No'xat 35%, kungaboqar 20%, tatsoy 20%, mizuna 15%, brokkoli 10%",
        "Kaloriya / Калорийность": "25 kkal / 100 g",
        "Uglevodlar / Углеводы": "3.3 g / 100 g",
        "Tolalar / Пищевые волокна": "2.0 g / 100 g",
        "Oqsil / Белок": "3.2 g / 100 g",
        "Yog' / Жиры": "0.6 g / 100 g",
        "K vitamini / Витамин K": "103 mkg / 100 g",
        "Qiymatlar / Значения": "Tarkib bo'yicha hisoblangan / Расчёт по составу",
        "Berish / Подача": "Asosiy taomdan 10-15 daqiqa oldin / За 10-15 минут до основного блюда",
        "Saqlash / Хранение": "2-5°C, 3-5 kun / 2-5°C, 3-5 дней"
      }
    },
    'balans-palov': {
      descUz: "Redis, kress, kashnich, gorchitsa va rukkola. O'zbek dasturxoniga tanish o'tkir profil — kashnich va redis issiq taom yonida. Palovdan oldin bering.",
      descRu: "Редис, кресс-салат, кориандр, горчица и руккола. Острый профиль, привычный узбекскому столу — кинза и редис рядом с горячим. Подают перед пловом.",
      specs: {
        "Netto / Нетто": "100 g",
        "Tarkibi / Состав": "Redis 30%, kress 25%, kashnich 20%, gorchitsa 15%, rukkola 10%",
        "Kaloriya / Калорийность": "32 kkal / 100 g",
        "Uglevodlar / Углеводы": "3.8 g / 100 g",
        "Tolalar / Пищевые волокна": "1.8 g / 100 g",
        "Oqsil / Белок": "2.9 g / 100 g",
        "Yog' / Жиры": "0.6 g / 100 g",
        "K vitamini / Витамин K": "259 mkg / 100 g",
        "Qiymatlar / Значения": "Tarkib bo'yicha hisoblangan / Расчёт по составу",
        "Berish / Подача": "Asosiy taomdan 10-15 daqiqa oldin / За 10-15 минут до основного блюда",
        "Saqlash / Хранение": "2-5°C, 3-5 kun / 2-5°C, 3-5 дней"
      }
    },
    'balans-krest': {
      descUz: "Kolrabi, brokkoli, kress, redis Sango va gorchitsa. Zich karam-qalampir ta'mi — o'tkirroq yoqtiradiganlar uchun.",
      descRu: "Кольраби, брокколи, кресс-салат, редис Санго и горчица. Плотный капустно-перечный вкус для тех, кто любит поострее.",
      specs: {
        "Netto / Нетто": "100 g",
        "Tarkibi / Состав": "Kolrabi 30%, brokkoli 25%, kress 20%, redis Sango 15%, gorchitsa 10%",
        "Kaloriya / Калорийность": "32 kkal / 100 g",
        "Uglevodlar / Углеводы": "4.8 g / 100 g",
        "Tolalar / Пищевые волокна": "2.0 g / 100 g",
        "Oqsil / Белок": "2.9 g / 100 g",
        "Yog' / Жиры": "0.5 g / 100 g",
        "K vitamini / Витамин K": "194 mkg / 100 g",
        "Qiymatlar / Значения": "Tarkib bo'yicha hisoblangan / Расчёт по составу",
        "Berish / Подача": "Asosiy taomdan 10-15 daqiqa oldin / За 10-15 минут до основного блюда",
        "Saqlash / Хранение": "2-5°C, 3-5 kun / 2-5°C, 3-5 дней"
      }
    },
    'balans-rang': {
      descUz: "Amarant, qizil mizuna, qizil pakchoy, qizil gorchitsa va mangold. Dasturxon va banket uchun pushti-binafsha berish.",
      descRu: "Амарант, мизуна красная, пак-чой красный, горчица красная и мангольд. Пурпурная подача для тарелки и банкета.",
      specs: {
        "Netto / Нетто": "100 g",
        "Tarkibi / Состав": "Amarant 25%, qizil mizuna 20%, qizil pakchoy 20%, qizil gorchitsa 20%, mangold 15%",
        "Kaloriya / Калорийность": "24 kkal / 100 g",
        "Uglevodlar / Углеводы": "3.6 g / 100 g",
        "Tolalar / Пищевые волокна": "1.8 g / 100 g",
        "Oqsil / Белок": "2.5 g / 100 g",
        "Yog' / Жиры": "0.3 g / 100 g",
        "K vitamini / Витамин K": "236 mkg / 100 g",
        "Qiymatlar / Значения": "Tarkib bo'yicha hisoblangan / Расчёт по составу",
        "Berish / Подача": "Asosiy taomdan 10-15 daqiqa oldin / За 10-15 минут до основного блюда",
        "Saqlash / Хранение": "2-5°C, 3-5 kun / 2-5°C, 3-5 дней"
      }
    },
    'balans-kit-avval': {
      descUz: "BALANS Yumshoq qadog'i va 15 ml ziravor sashesi: zaytun moyi, vino sirkasi, tuz. Sashe alohida — berishgacha ko'kat cho'kmaydi.",
      descRu: "Упаковка микса BALANS Мягкий и саше заправки 15 мл: оливковое масло, винный уксус, соль. Заправка отдельно — до подачи зелень не оседает.",
      specs: {
        "To'plam / Комплектация": "Miks 100 g + sashe 15 ml / Микс 100 г + саше 15 мл",
        "Miks / Микс": "BALANS Yumshoq",
        "Sashe tarkibi / Состав саше": "Zaytun moyi, vino sirkasi, tuz / Оливковое масло, винный уксус, соль",
        "Uglevodlar / Углеводы": "3.3 g / 100 g miks",
        "Berish / Подача": "Berishdan oldin aralashtiring / Смешать перед подачей",
        "Saqlash / Хранение": "2-5°C, 3-5 kun / 2-5°C, 3-5 дней"
      }
    },
    'balans-kit-toyimli': {
      descUz: "BALANS Krest miksi, 20 g urug' aralashmasi (zig'ir, qovoq, kungaboqar) va ziravor sashesi. Shorvaga non o'rniga zich gazak.",
      descRu: "Микс BALANS Крестоцветный, 20 г семян (лён, тыква, подсолнечник) и саше заправки. Плотный перекус вместо хлеба к супу.",
      specs: {
        "To'plam / Комплектация": "Miks 100 g + urug' 20 g + sashe / Микс 100 г + семена 20 г + саше",
        "Miks / Микс": "BALANS Krest",
        "Urug'lar / Семена": "Zig'ir, qovoq, kungaboqar / Лён, тыква, подсолнечник",
        "Uglevodlar / Углеводы": "4.8 g / 100 g miks",
        "Berish / Подача": "Berishdan oldin aralashtiring / Смешать перед подачей",
        "Saqlash / Хранение": "2-5°C, 3-5 kun / 2-5°C, 3-5 дней"
      }
    },

    // ===== EQUIPMENT & KITS =====
    'led-fito-50w': {
      descUz: "50W to'liq fitospektrli professional LED lampa (PAR 380-780nm). Mikroko'kat, ko'kat va ko'chat uchun.",
      descRu: "Профессиональная светодиодная фитолампа мощностью 50 Вт с полным спектром (380-780 нм). Для микрозелени, зелени и рассады.",
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
      // Auto-generate specs by category
      if (p.category.slug === 'microgreens') {
        specs = {
          "O'sish davri / Срок ротации": "7-10 kun / 7-10 дней",
          "Vitaminlar / Витамины": "A, B, C, E, K",
          "Minerallar / Минералы": "Кальций, Железо, Магний, Калий",
          "Ta'm / Вкус": "Yangi va xushbo'y / Свежий и насыщенный",
          "Tarkibida / В составе": "Kletchatka, vitaminlar / Клетчатка, витамины",
          "Yaroqlilik muddati / Срок хранения": "7 kun (2-5°C) / 7 дней (2-5°C)"
        };
      } else if (p.category.slug === 'balans') {
        // Страховка: у всех шести позиций BALANS есть явная карточка выше.
        // Ветка нужна, чтобы новый SKU не уехал на витрину с пустым составом.
        specs = {
          "Netto / Нетто": "100 g",
          "Berish / Подача": "Asosiy taomdan 10-15 daqiqa oldin / За 10-15 минут до основного блюда",
          "Saqlash / Хранение": "2-5°C, 3-5 kun / 2-5°C, 3-5 дней"
        };
      } else if (p.category.slug === 'baby-leaf' || p.category.slug === 'salads') {
        specs = {
          "Netto vazni / Вес нетто": "100g / 100г",
          "Vitaminlar / Витамины": "A, C, K, Folic acid",
          "Saqlash harorati / Температура хранения": "2°C - 5°C",
          "Tarkibida / В составе": "Kletchatka, vitaminlar / Клетчатка, витамины",
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
