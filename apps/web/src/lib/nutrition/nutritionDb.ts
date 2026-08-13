// Справочник культур и рецептов. Вынесено из api/ai/nutrition/route.ts:
// файл перерос 200 строк, а в route.ts Next.js разрешает экспортировать
// только HTTP-обработчики.

// ══════════════════════════════════════════════════════════════════════
// MICROGREEN NUTRITION DATABASE (per 100g)
// Источник значений: USDA FoodData Central и профили микрозелени
// (Journal of Agricultural and Food Chemistry, Xiao et al.).
//
// ПОЧЕМУ ЗДЕСЬ НЕТ ОБЕЩАНИЙ ПОЛЬЗЫ
//
// Раньше в `benefits` стояло «Сульфорафан — профилактика рака», «Контролирует
// уровень сахара в крови», «Ускоряет метаболизм». Это заявления о лечебных и
// оздоровительных свойствах, а они по узбекскому законодательству требуют
// разрешения Минздрава и «Узстандарта» — у нас его нет. Плюс ни одно из них
// не подтверждено испытаниями нашего продукта.
//
// Правило: утверждение о СВОЙСТВЕ заменено утверждением о СОСТАВЕ или о вкусе.
// «Богат витамином C» → «Витамин C: 97 мг/100 г». Сравнения допускаются только
// внутри нашего же ассортимента — они проверяются по таблице ниже.
//
// По той же причине убрано поле `antioxidantMultiplier`: «×40 антиоксидантов»
// выводилось в калькуляторе как измеренная характеристика нашего товара, хотя
// это чужая цифра про другое растение.
// ══════════════════════════════════════════════════════════════════════
export const NUTRITION_DB: Record<string, {
  nameUz: string; nameRu: string;
  calories: number; protein: number; fat: number; carbs: number; fiber: number;
  vitC: number; vitA: number; vitK: number; vitE: number;
  iron: number; calcium: number; potassium: number; magnesium: number; zinc: number;
  growDays: number;
  benefits: { uz: string; ru: string }[];
}> = {
  rukkola: {
    nameUz: 'Rukkola', nameRu: 'Руккола',
    calories: 25, protein: 2.6, fat: 0.7, carbs: 3.7, fiber: 1.6,
    vitC: 97, vitA: 2373, vitK: 108.6, vitE: 0.4,
    iron: 1.5, calcium: 160, potassium: 369, magnesium: 47, zinc: 0.5,
    growDays: 7,
    benefits: [
      { uz: "O'tkir xantal ta'mi", ru: 'Острый горчичный вкус' },
      { uz: "Assortimentda eng ko'p C vitamini — 97 mg/100 g", ru: 'Больше всего витамина C в ассортименте — 97 мг/100 г' },
    ],
  },
  rediska: {
    nameUz: 'Rediska', nameRu: 'Редис',
    calories: 43, protein: 3.8, fat: 0.5, carbs: 3.4, fiber: 2.1,
    vitC: 38, vitA: 391, vitK: 28.9, vitE: 2.4,
    iron: 2.2, calcium: 51, potassium: 280, magnesium: 35, zinc: 0.6,
    growDays: 6,
    benefits: [
      { uz: "Keskin achchiq ta'm, qarsildoq poya", ru: 'Резкая острота, хрустящий стебель' },
      { uz: 'Temir 2.2 mg va E vitamini 2.4 mg / 100 g', ru: 'Железо 2.2 мг и витамин E 2.4 мг на 100 г' },
    ],
  },
  kungaboqar: {
    nameUz: 'Kungaboqar', nameRu: 'Подсолнечник',
    calories: 28, protein: 3.2, fat: 1.4, carbs: 2.2, fiber: 1.8,
    vitC: 9.7, vitA: 240, vitK: 78, vitE: 4.4,
    iron: 2.0, calcium: 35, potassium: 254, magnesium: 56, zinc: 1.3,
    growDays: 7,
    benefits: [
      { uz: "Yong'oq ta'mi, zich poya", ru: 'Ореховый вкус, плотный стебель' },
      { uz: "Assortimentda eng ko'p E vitamini — 4.4 mg/100 g", ru: 'Больше всего витамина E в ассортименте — 4.4 мг/100 г' },
    ],
  },
  brokkoli: {
    nameUz: 'Brokkoli', nameRu: 'Брокколи',
    calories: 34, protein: 2.8, fat: 0.6, carbs: 6.6, fiber: 2.6,
    vitC: 89, vitA: 623, vitK: 101.6, vitE: 0.8,
    iron: 0.7, calcium: 47, potassium: 316, magnesium: 21, zinc: 0.4,
    growDays: 7,
    benefits: [
      { uz: "Yumshoq karam ta'mi", ru: 'Мягкий капустный вкус' },
      { uz: 'Glukozinolatlar manbai; tolalar 2.6 g/100 g', ru: 'Источник глюкозинолатов; клетчатка 2.6 г/100 г' },
    ],
  },
  kolrabi: {
    nameUz: 'Kolrabi', nameRu: 'Кольраби',
    calories: 27, protein: 2.7, fat: 0.4, carbs: 4.2, fiber: 2.2,
    vitC: 62, vitA: 350, vitK: 95, vitE: 0.6,
    iron: 0.9, calcium: 55, potassium: 350, magnesium: 25, zinc: 0.4,
    growDays: 8,
    benefits: [
      { uz: "Yumshoq karam ta'mi, achchiqsiz", ru: 'Мягкий капустный вкус, без горечи' },
      { uz: 'C vitamini 62 mg, tolalar 2.2 g / 100 g', ru: 'Витамин C 62 мг, клетчатка 2.2 г на 100 г' },
    ],
  },
  kress: {
    nameUz: 'Kress-salat', nameRu: 'Кресс-салат',
    calories: 32, protein: 2.6, fat: 0.7, carbs: 4.4, fiber: 1.1,
    vitC: 69, vitA: 3191, vitK: 542, vitE: 0.7,
    iron: 1.3, calcium: 81, potassium: 606, magnesium: 38, zinc: 0.2,
    growDays: 6,
    benefits: [
      { uz: "Qalampir achchiqligi", ru: 'Перечная острота' },
      { uz: "Assortimentda eng ko'p K vitamini — 542 mkg/100 g", ru: 'Больше всего витамина K в ассортименте — 542 мкг/100 г' },
    ],
  },
  nohat: {
    nameUz: "No'xat", nameRu: 'Горох',
    calories: 23, protein: 4.2, fat: 0.3, carbs: 3.1, fiber: 2.3,
    vitC: 12, vitA: 166, vitK: 24.8, vitE: 0.2,
    iron: 1.3, calcium: 25, potassium: 220, magnesium: 18, zinc: 0.5,
    growDays: 5,
    benefits: [
      { uz: "Shirinroq ta'm, sershira nihol", ru: 'Сладковатый вкус, сочный побег' },
      { uz: "Assortimentda eng ko'p oqsil — 4.2 g/100 g", ru: 'Больше всего белка в ассортименте — 4.2 г/100 г' },
    ],
  },
  mosh: {
    nameUz: 'Mosh (mung)', nameRu: 'Маш',
    calories: 19, protein: 3.0, fat: 0.2, carbs: 2.7, fiber: 1.9,
    vitC: 13, vitA: 127, vitK: 33, vitE: 0.1,
    iron: 0.9, calcium: 13, potassium: 149, magnesium: 18, zinc: 0.4,
    growDays: 5,
    benefits: [
      { uz: "Neytral ta'm, qarsildoq", ru: 'Нейтральный вкус, хрустит' },
      { uz: 'Assortimentda eng past kaloriya — 19 kkal/100 g', ru: 'Самая низкая калорийность в ассортименте — 19 ккал/100 г' },
    ],
  },
  bazilika: {
    nameUz: 'Bazilika', nameRu: 'Базилик',
    calories: 22, protein: 3.2, fat: 0.6, carbs: 2.7, fiber: 1.6,
    vitC: 18, vitA: 5275, vitK: 414.8, vitE: 0.8,
    iron: 3.2, calcium: 177, potassium: 295, magnesium: 64, zinc: 0.8,
    growDays: 10,
    benefits: [
      { uz: 'Ziravorli hid', ru: 'Пряный аромат' },
      { uz: "Assortimentda eng ko'p A vitamini va temir", ru: 'Больше всего витамина A и железа в ассортименте' },
    ],
  },
  gorchitsa: {
    nameUz: 'Gorchitsa', nameRu: 'Горчица',
    calories: 26, protein: 2.9, fat: 0.4, carbs: 4.7, fiber: 2.0,
    vitC: 70, vitA: 3024, vitK: 278, vitE: 2.0,
    iron: 1.6, calcium: 115, potassium: 384, magnesium: 32, zinc: 0.3,
    growDays: 6,
    benefits: [
      { uz: 'Kuydiruvchi xantal notasi', ru: 'Жгучая горчичная нота' },
      { uz: 'C vitamini 70 mg va A vitamini 3024 mkg / 100 g', ru: 'Витамин C 70 мг и витамин A 3024 мкг на 100 г' },
    ],
  },
  tatsoy: {
    nameUz: 'Tatsoy', nameRu: 'Татсой',
    calories: 22, protein: 2.4, fat: 0.3, carbs: 3.2, fiber: 1.7,
    vitC: 45, vitA: 2800, vitK: 180, vitE: 0.9,
    iron: 1.2, calcium: 105, potassium: 320, magnesium: 22, zinc: 0.3,
    growDays: 7,
    benefits: [
      { uz: "Yumshoq, biroz shirin ta'm", ru: 'Мягкий, чуть сладковатый вкус' },
      { uz: 'Kalsiy 105 mg / 100 g', ru: 'Кальций 105 мг на 100 г' },
    ],
  },
  mizuna: {
    nameUz: 'Mizuna', nameRu: 'Мизуна',
    calories: 21, protein: 2.3, fat: 0.3, carbs: 3.0, fiber: 1.8,
    vitC: 55, vitA: 2900, vitK: 220, vitE: 1.1,
    iron: 1.4, calcium: 110, potassium: 350, magnesium: 25, zinc: 0.3,
    growDays: 7,
    benefits: [
      { uz: 'Yengil xantal notasi', ru: 'Лёгкая горчичная нота' },
      { uz: 'A vitamini 2900 mkg / 100 g', ru: 'Витамин A 2900 мкг на 100 г' },
    ],
  },
  pakchoy: {
    nameUz: 'Pakchoy', nameRu: 'Пак-чой',
    calories: 20, protein: 2.2, fat: 0.3, carbs: 2.9, fiber: 1.5,
    vitC: 48, vitA: 2400, vitK: 160, vitE: 0.5,
    iron: 1.0, calcium: 95, potassium: 340, magnesium: 20, zinc: 0.3,
    growDays: 7,
    benefits: [
      { uz: 'Sershira poya, neytral barg', ru: 'Сочный стебель, нейтральный лист' },
      { uz: '20 kkal va 2.9 g uglevod / 100 g', ru: '20 ккал и 2.9 г углеводов на 100 г' },
    ],
  },
  mangold: {
    nameUz: 'Mangold', nameRu: 'Мангольд',
    calories: 24, protein: 2.1, fat: 0.3, carbs: 3.6, fiber: 1.9,
    vitC: 33, vitA: 3100, vitK: 480, vitE: 1.6,
    iron: 2.0, calcium: 62, potassium: 420, magnesium: 55, zinc: 0.4,
    growDays: 9,
    benefits: [
      { uz: "Tuproqsimon ta'm, yorqin poya", ru: 'Землистый вкус, яркий стебель' },
      { uz: 'Magniy 55 mg va K vitamini 480 mkg / 100 g', ru: 'Магний 55 мг и витамин K 480 мкг на 100 г' },
    ],
  },
  amarant: {
    nameUz: 'Amarant', nameRu: 'Амарант',
    calories: 27, protein: 2.9, fat: 0.4, carbs: 3.8, fiber: 2.0,
    vitC: 42, vitA: 1900, vitK: 130, vitE: 0.9,
    iron: 2.5, calcium: 130, potassium: 400, magnesium: 45, zinc: 0.6,
    growDays: 10,
    benefits: [
      { uz: 'Lavlagi notasi, qizil barg', ru: 'Свекольная нота, малиновый лист' },
      { uz: 'Temir 2.5 mg va kalsiy 130 mg / 100 g', ru: 'Железо 2.5 мг и кальций 130 мг на 100 г' },
    ],
  },
  kashnich: {
    nameUz: 'Kashnich', nameRu: 'Кориандр',
    calories: 23, protein: 2.1, fat: 0.5, carbs: 3.1, fiber: 2.4,
    vitC: 27, vitA: 3300, vitK: 310, vitE: 2.5,
    iron: 1.8, calcium: 67, potassium: 521, magnesium: 26, zinc: 0.5,
    growDays: 12,
    benefits: [
      { uz: "Yorqin kashnich ta'mi", ru: 'Яркий вкус кинзы' },
      { uz: 'E vitamini 2.5 mg va tolalar 2.4 g / 100 g', ru: 'Витамин E 2.5 мг и клетчатка 2.4 г на 100 г' },
    ],
  },
};

// ==========================================
// RECIPE OF THE DAY DATABASE (30 recipes for monthly rotation)
// ==========================================
export const RECIPES: {
  nameUz: string; nameRu: string;
  microgreens: string[];
  prepTime: number; servings: number;
  calories: number; protein: number;
  ingredientsUz: string[]; ingredientsRu: string[];
  stepsUz: string[]; stepsRu: string[];
  tipUz: string; tipRu: string;
  category: 'breakfast' | 'salad' | 'smoothie' | 'snack' | 'main';
}[] = [
  {
    nameUz: "Brokkoli mikroko'kat smoothie", nameRu: 'Смузи с микрозеленью брокколи',
    microgreens: ['brokkoli', 'kungaboqar'], prepTime: 5, servings: 1, calories: 180, protein: 8,
    ingredientsUz: ['Brokkoli mikroko\'kat — 30g', 'Kungaboqar mikroko\'kat — 15g', 'Banan — 1 dona', 'Yogurt — 150 ml', 'Asal — 1 choy qoshiq'],
    ingredientsRu: ['Микрозелень брокколи — 30г', 'Микрозелень подсолнечника — 15г', 'Банан — 1 шт', 'Йогурт — 150 мл', 'Мёд — 1 ч.л.'],
    stepsUz: ['Barcha ingredientlarni blenderga soling', '30 soniya yuqori tezlikda aralashtiring', 'Stakanga quying, ustiga kungaboqar qo\'ying'],
    stepsRu: ['Все ингредиенты положите в блендер', 'Взбивайте 30 секунд на высокой скорости', 'Перелейте в стакан, сверху положите подсолнечник'],
    tipUz: "Sulforafan to'qima buzilganda hosil bo'ladi — blender buni pichoqdan yaxshiroq qiladi.", tipRu: 'Сульфорафан образуется при разрушении ткани — блендер делает это лучше ножа.',
    category: 'smoothie',
  },
  {
    nameUz: "Rukkola va tuxum tost", nameRu: 'Тост с рукколой и яйцом',
    microgreens: ['rukkola'], prepTime: 10, servings: 2, calories: 280, protein: 14,
    ingredientsUz: ['Non (tost) — 2 dona', 'Tuxum — 2 dona', 'Rukkola mikroko\'kat — 20g', 'Avokado — yarim', 'Tuz, qora murch'],
    ingredientsRu: ['Тост — 2 шт', 'Яйцо — 2 шт', 'Микрозелень рукколы — 20г', 'Авокадо — половина', 'Соль, чёрный перец'],
    stepsUz: ['Nonni tosterda qizartiring', 'Tuxumni qaynatib yoki qovurib pishiring', 'Avokadoni ezib non ustiga suring', 'Tuxumni ustiga qo\'ying, rukkola bilan bezang'],
    stepsRu: ['Поджарьте хлеб в тостере', 'Сварите или пожарьте яйцо', 'Разомните авокадо на тосте', 'Положите яйцо сверху, украсьте рукколой'],
    tipUz: "Mirozinaza va C vitamini 70 °C dan yuqorida parchalanadi — tayyor taomga qo'shing.", tipRu: 'Мирозиназа и витамин C разрушаются выше 70 °C — добавляйте в уже готовое блюдо.',
    category: 'breakfast',
  },
  {
    nameUz: "5 turdagi mikroko'kat salati", nameRu: 'Салат из 5 видов микрозелени',
    microgreens: ['rukkola', 'rediska', 'mosh', 'gorchitsa', 'brokkoli'], prepTime: 8, servings: 2, calories: 120, protein: 6,
    ingredientsUz: ['Rukkola — 15g', 'Rediska — 15g', 'Mosh — 15g', 'Gorchitsa — 10g', 'Brokkoli — 10g', 'Zaytun moyi — 1 osh qoshiq', 'Limon sharbati — 1 osh qoshiq'],
    ingredientsRu: ['Руккола — 15г', 'Редис — 15г', 'Маш — 15г', 'Горчица — 10г', 'Брокколи — 10г', 'Оливковое масло — 1 ст.л.', 'Лимонный сок — 1 ст.л.'],
    stepsUz: ['Barcha mikroko\'katlarni yuvib quritiring', 'Katta laganga soling va aralang', 'Zaytun moyi va limon sharbatini seping', 'Tuz va murch qo\'shing'],
    stepsRu: ['Промойте и обсушите всю микрозелень', 'Выложите в большую миску и перемешайте', 'Полейте оливковым маслом и лимонным соком', 'Посолите и поперчите'],
    tipUz: "Faqat berishdan oldin ziravorlang: kislotada ko'kat bir soatda elastikligini yo'qotadi.", tipRu: 'Заправляйте только перед подачей: в кислоте зелень теряет упругость за час.',
    category: 'salad',
  },
  {
    nameUz: "Protein bowl — sportchilar uchun", nameRu: 'Протеин-боул для спортсменов',
    microgreens: ['nohat', 'kungaboqar'], prepTime: 12, servings: 1, calories: 350, protein: 22,
    ingredientsUz: ['No\'xat mikroko\'kat — 40g', 'Kungaboqar — 20g', 'Qaynatilgan guruch — 150g', 'Tovuq ko\'krak — 100g', 'Soya sousi — 1 osh qoshiq'],
    ingredientsRu: ['Микрозелень гороха — 40г', 'Подсолнечник — 20г', 'Варёный рис — 150г', 'Куриная грудка — 100г', 'Соевый соус — 1 ст.л.'],
    stepsUz: ['Guruchni qaynatib, sovuting', 'Tovuqni qizartiring va bo\'laklang', 'Idishga guruch, tovuq, mikroko\'katlarni chiroyli joylashtiring', 'Soya sousi seping'],
    stepsRu: ['Сварите рис и остудите', 'Обжарьте и нарежьте курицу', 'Красиво выложите рис, курицу и микрозелень', 'Полейте соевым соусом'],
    tipUz: "No'xat mikroko'kat 100g da 4.2g oqsil — eng yuqori ko'rsatkich!", tipRu: 'В 100г микрозелени гороха 4.2г белка — лучший показатель!',
    category: 'main',
  },
  {
    nameUz: "Gorchitsa va pishloq snack", nameRu: 'Снэк с горчицей и сыром',
    microgreens: ['gorchitsa', 'bazilika'], prepTime: 5, servings: 2, calories: 160, protein: 9,
    ingredientsUz: ['Gorchitsa mikroko\'kat — 20g', 'Bazilika mikroko\'kat — 10g', 'Qattiq pishloq — 50g', 'Kreker — 6 dona', 'Asal — 1 choy qoshiq'],
    ingredientsRu: ['Микрозелень горчицы — 20г', 'Микрозелень базилика — 10г', 'Твёрдый сыр — 50г', 'Крекеры — 6 шт', 'Мёд — 1 ч.л.'],
    stepsUz: ['Pishloqni yupqa bo\'laklang', 'Krekerlarga pishloq qo\'ying', 'Mikroko\'katlar bilan bezang', 'Asal tomchilating'],
    stepsRu: ['Нарежьте сыр тонкими ломтиками', 'Положите сыр на крекеры', 'Украсьте микрозеленью', 'Капните мёд'],
    tipUz: "Gorchitsa kuydiradi — 10 g yetarli, ko'proq qo'ysangiz pishloq ta'mi yo'qoladi.", tipRu: 'Горчица жжёт — 10 г достаточно, больше перебьёт вкус сыра.',
    category: 'snack',
  },
  {
    nameUz: "Bazilika limonad", nameRu: 'Базиликовый лимонад',
    microgreens: ['bazilika'], prepTime: 7, servings: 4, calories: 45, protein: 1,
    ingredientsUz: ['Bazilika mikroko\'kat — 15g', 'Limon — 2 dona', 'Shakar — 3 osh qoshiq', 'Suv — 1 litr', 'Muz'],
    ingredientsRu: ['Микрозелень базилика — 15г', 'Лимон — 2 шт', 'Сахар — 3 ст.л.', 'Вода — 1 литр', 'Лёд'],
    stepsUz: ['Limon sharbatini siqib oling', 'Suvga shakar qo\'shib aralashtiring', 'Bazilika qo\'shing va 10 min dam bering', 'Muzli stakanlarga quying'],
    stepsRu: ['Выжмите сок лимонов', 'Добавьте сахар в воду и перемешайте', 'Добавьте базилик и настаивайте 10 мин', 'Разлейте по стаканам со льдом'],
    tipUz: "Bazilika sovuq suvga hidini 10 daqiqada beradi — uzoqroq ushlash shart emas.", tipRu: 'Базилик отдаёт аромат холодной воде за 10 минут — дольше держать незачем.',
    category: 'smoothie',
  },
  {
    nameUz: "Rediska va qaymoq brusketta", nameRu: 'Брускетта с редисом и крем-чизом',
    microgreens: ['rediska', 'rukkola'], prepTime: 8, servings: 3, calories: 190, protein: 7,
    ingredientsUz: ['Rediska mikroko\'kat — 25g', 'Rukkola — 10g', 'Qaymoqli pishloq — 80g', 'Baget non — 6 bo\'lak', 'Zaytun moyi, tuz'],
    ingredientsRu: ['Микрозелень редиса — 25г', 'Руккола — 10г', 'Крем-сыр — 80г', 'Багет — 6 ломтиков', 'Оливковое масло, соль'],
    stepsUz: ['Bagetni qizartiring', 'Pishloqni suring', 'Rediska va rukkola qo\'ying', 'Zaytun moyi seping'],
    stepsRu: ['Подрумяньте багет', 'Намажьте крем-сыр', 'Выложите редис и рукколу', 'Полейте оливковым маслом'],
    tipUz: "Rediskani oxirida qo'ying — pastda qolsa, pishloq ostida ezilib qoladi.", tipRu: 'Редис кладите последним — под сыром он приминается.',
    category: 'snack',
  },

  // ── Низкоуглеводные рецепты линейки BALANS ────────────────────────────
  // Отличие от рецептов выше: без сахара, мёда и бананов, и подача привязана
  // к методу «сначала зелень» — тарелку съедают ДО основного блюда.
  {
    nameUz: "Palov oldidan tarelka", nameRu: 'Тарелка перед пловом',
    microgreens: ['rediska', 'kress', 'kashnich', 'gorchitsa', 'rukkola'], prepTime: 5, servings: 2, calories: 95, protein: 3,
    ingredientsUz: ["BALANS Palov miksi — 100 g", 'Bodring — 1 dona', 'Zaytun moyi — 1 osh qoshiq', 'Vino sirkasi — 2 choy qoshiq', 'Tuz, qora murch'],
    ingredientsRu: ['Микс BALANS К плову — 100 г', 'Огурец — 1 шт', 'Оливковое масло — 1 ст.л.', 'Винный уксус — 2 ч.л.', 'Соль, чёрный перец'],
    stepsUz: ['Bodringni yupqa to‘g‘rang', 'Miks bilan aralashtiring', 'Moy va sirkani berishdan oldin quying', 'Palovdan 10-15 daqiqa oldin yeng'],
    stepsRu: ['Нарежьте огурец тонкими ломтиками', 'Смешайте с миксом', 'Масло и уксус влейте перед подачей', 'Съешьте за 10–15 минут до плова'],
    tipUz: "Sirkani oldindan quymang: ko'kat bir soatda cho'kadi.", tipRu: 'Не заправляйте заранее: зелень оседает за час.',
    category: 'salad',
  },
  {
    nameUz: "Tuxum va zig'ir urug'li yashil tarelka", nameRu: 'Зелёная тарелка с яйцом и льном',
    microgreens: ['kolrabi', 'brokkoli', 'kress'], prepTime: 12, servings: 1, calories: 240, protein: 15,
    ingredientsUz: ['BALANS Krest miksi — 100 g', 'Qaynatilgan tuxum — 2 dona', "Yanchilgan zig'ir urug'i — 1 osh qoshiq", 'Zaytun moyi — 1 osh qoshiq', 'Limon sharbati'],
    ingredientsRu: ['Микс BALANS Крестоцветный — 100 г', 'Варёное яйцо — 2 шт', 'Молотое льняное семя — 1 ст.л.', 'Оливковое масло — 1 ст.л.', 'Лимонный сок'],
    stepsUz: ['Tuxumni qaynatib, choraklab kesing', 'Miksni laganga yoying', "Tuxum va zig'ir urug'ini ustiga soling", 'Moy va limon sharbatini quying'],
    stepsRu: ['Отварите яйца и разрежьте на четверти', 'Выложите микс на тарелку', 'Сверху — яйцо и молотый лён', 'Полейте маслом и лимонным соком'],
    tipUz: "Zig'irni yanchib soling: butun urug' hazm bo'lmasdan chiqib ketadi.", tipRu: 'Лён берите молотый: целое семя проходит транзитом.',
    category: 'main',
  },
  {
    nameUz: "Nonsiz yashil nonushta", nameRu: 'Зелёный завтрак без хлеба',
    microgreens: ['nohat', 'kungaboqar', 'tatsoy'], prepTime: 8, servings: 1, calories: 210, protein: 12,
    ingredientsUz: ['BALANS Yumshoq miksi — 100 g', 'Suluguni pishloq — 50 g', "Qovoq urug'i — 15 g", 'Zaytun moyi — 1 osh qoshiq', 'Tuz'],
    ingredientsRu: ['Микс BALANS Мягкий — 100 г', 'Сыр сулугуни — 50 г', 'Тыквенные семечки — 15 г', 'Оливковое масло — 1 ст.л.', 'Соль'],
    stepsUz: ['Pishloqni kubiklang', "Miks, pishloq va urug'ni aralashtiring", 'Moy quying va tuz seping', 'Yaxshilab chaynab yeng'],
    stepsRu: ['Нарежьте сыр кубиком', 'Смешайте микс, сыр и семечки', 'Полейте маслом, посолите', 'Ешьте, тщательно пережёвывая'],
    tipUz: "Yog' kerak: yog'da eriydigan vitaminlar usiz so'rilmaydi.", tipRu: 'Масло нужно: жирорастворимые витамины без жира не усваиваются.',
    category: 'breakfast',
  },
];

// Micronutrient totals for a set of microgreens (≈20g of each in a serving).
