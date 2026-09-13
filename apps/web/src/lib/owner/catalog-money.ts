import type { Practice } from './practices';

// Практики области «Личные деньги».
//
// Содержимое, а не логика: вытащено из разбора канала, где за каждой
// строкой стоит несколько советов. Ритм — предположение, и владелец
// меняет его на экране: своя неделя виднее отсюда.

export const MONEY_PRACTICES: Practice[] = [
  {
    key: 'money-zapisyvat-vse-traty-i-razbivat-po',
    title: {
      ru: 'Записывать все траты и разбивать по категориям',
      uz: "Barcha xarajatlarni yozib borish va toifalarga ajratish",
    },
    why: {
      ru: 'Без исключений — иначе картина неполная. Категории показывают, куда деньги уходят на самом деле, а не куда, как вам кажется, они уходят.',
      uz: "Istisnosiz — aks holda manzara to'liq emas. Toifalar pul aslida qayerga ketayotganini ko'rsatadi, sizga tuyulganidek emas.",
    },
    rhythm: 'daily',
    videos: ['074'],
  },
  {
    key: 'money-melkie-traty-dyrki-v-lodke',
    title: {
      ru: 'Мелкие траты — дырки в лодке',
      uz: "Mayda xarajatlar — qayiqdagi teshiklar",
    },
    why: {
      ru: 'Образ канала точный: каждая по отдельности незаметна, вместе они топят. Проверить, за что вы переплачиваете, — разовое упражнение с постоянным эффектом.',
      uz: "Kanal obrazi aniq: alohida har biri sezilmaydi, birgalikda cho'ktiradi. Nima uchun ortiqcha to'layotganingizni tekshirish — bir martalik mashq, ta'siri doimiy.",
    },
    rhythm: 'monthly',
    videos: ['074'],
  },
  {
    key: 'money-stoimost-odnogo-ispolzovaniya',
    title: {
      ru: 'Стоимость одного использования',
      uz: "Bir marta foydalanish qiymati",
    },
    why: {
      ru: 'Цена вещи, делённая на число использований. Меняет отношение к покупкам сильнее, чем сама цена.',
      uz: "Narsaning narxi foydalanishlar soniga bo'linadi. Xaridlarga munosabatni narxning o'zidan kuchliroq o'zgartiradi.",
    },
    rhythm: 'principle',
    videos: ['007'],
  },
  {
    key: 'money-dorogaya-bednost-i-nalogi-na-slabosti',
    title: {
      ru: '«Дорогая бедность» и налоги на слабости',
      uz: "«Qimmat qashshoqlik» va zaifliklarga soliq",
    },
    why: {
      ru: 'Две точные формулировки канала. Дорогая бедность — регулярная покупка дешёвого, которое быстро выходит из строя, и в сумме обходится дороже качественного.',
      uz: "Kanalning ikki aniq ta'rifi. Qimmat qashshoqlik — tez ishdan chiqadigan arzonni muntazam sotib olish, yig'indida sifatlisidan qimmatga tushadi.",
    },
    rhythm: 'principle',
    videos: ['007'],
  },
  {
    key: 'money-period-ohlazhdeniya-pered-pokupkoy',
    title: {
      ru: 'Период охлаждения перед покупкой',
      uz: "Xariddan oldingi sovish muddati",
    },
    why: {
      ru: 'Пауза между решением и покупкой. Работает и для личных трат, и для закупки оборудования.',
      uz: "Qaror bilan xarid orasidagi pauza. Shaxsiy xarajatlarga ham, uskuna sotib olishga ham ishlaydi.",
    },
    rhythm: 'principle',
    videos: ['026'],
  },
  {
    key: 'money-chetyre-voprosa-pered-krupnoy-tratoy',
    title: {
      ru: 'Четыре вопроса перед крупной тратой',
      uz: "Yirik xarajatdan oldingi to'rt savol",
    },
    why: {
      ru: 'Нужно ли, сейчас ли, за эти ли деньги, что взамен. И более общее правило: каждое согласие — расход ресурса, не только денежного.',
      uz: "Kerakmi, hozirmi, shu pulgami, evaziga nima. Va umumiyroq qoida: har bir rozilik — resurs sarfi, faqat pulniki emas.",
    },
    rhythm: 'principle',
    videos: ['057'],
  },
  {
    key: 'money-planirovat-pokupki-zaranee',
    title: {
      ru: 'Планировать покупки заранее',
      uz: "Xaridlarni oldindan rejalashtirish",
    },
    why: {
      ru: 'Список вместо спонтанного решения в магазине.',
      uz: "Do'konda o'z-o'zidan qaror o'rniga ro'yxat.",
    },
    rhythm: 'principle',
    videos: ['074'],
  },
  {
    key: 'money-besplatnyy-den',
    title: {
      ru: '«Бесплатный день»',
      uz: "«Bepul kun»",
    },
    why: {
      ru: 'Сутки без единой траты. Простой способ увидеть автоматические расходы.',
      uz: "Birorta xarajatsiz sutka. Avtomatik xarajatlarni ko'rishning oddiy yo'li.",
    },
    rhythm: 'principle',
    videos: ['026'],
  },
  {
    key: 'money-predel-ekonomii',
    title: {
      ru: 'Предел экономии',
      uz: "Tejashning chegarasi",
    },
    why: {
      ru: 'Важная поправка: ужимание имеет дно, а рост дохода — нет. После определённого предела усилия лучше направлять на заработок, а не на экономию.',
      uz: "Muhim tuzatish: qisilishning tubi bor, daromad o'sishining esa yo'q. Ma'lum chegaradan keyin kuchni tejashga emas, topishga yo'naltirgan ma'qul.",
    },
    rhythm: 'principle',
    videos: ['007'],
  },
  {
    key: 'money-ne-rezat-rashody-kotorye-prinosyat-dohod',
    title: {
      ru: 'Не резать расходы, которые приносят доход',
      uz: "Daromad keltiradigan xarajatlarni qirqmang",
    },
    why: {
      ru: 'Самый важный совет всего выпуска про экономию. Для вас это семена, субстрат, топливо на объезд и всё, что связано со сбытом.',
      uz: "Tejash haqidagi butun sonning eng muhim maslahati. Siz uchun bu urug', substrat, aylanma uchun yoqilg'i va sotuvga bog'liq hamma narsa.",
    },
    rhythm: 'principle',
    videos: ['007'],
  },
  {
    key: 'money-reviziya-prostaivayuschih-aktivov-i-autsors',
    title: {
      ru: 'Ревизия простаивающих активов и аутсорс',
      uz: "Bo'sh turgan aktivlar reviziyasi va autsors",
    },
    why: {
      ru: 'Держать на аутсорсе всё, под что нет постоянного потока задач.',
      uz: "Doimiy vazifa oqimi yo'q hamma narsani autsorsda ushlash.",
    },
    rhythm: 'monthly',
    videos: ['007'],
  },
  {
    key: 'money-otdelnaya-summa-na-neobyazatelnoe',
    title: {
      ru: 'Отдельная сумма на необязательное',
      uz: "Majburiy bo'lmaganiga alohida summa",
    },
    why: {
      ru: 'Заложенная заранее сумма на удовольствия работает лучше запретов: она снимает чувство вины и не ломает бюджет.',
      uz: "Oldindan ajratilgan zavq summasi taqiqlardan yaxshiroq ishlaydi: u aybdorlik hissini olib tashlaydi va byudjetni buzmaydi.",
    },
    rhythm: 'setup',
    videos: ['007'],
  },
  {
    key: 'money-godovoy-gorizont',
    title: {
      ru: 'Годовой горизонт',
      uz: "Yillik ufq",
    },
    why: {
      ru: 'Планировать на год и приземлять ожидания. И честный вопрос себе: делали ли вы за год что-то, что реально увеличило доход.',
      uz: "Bir yilga rejalashtirish va kutilmalarni yerga tushirish. Va o'zingizga halol savol: yil davomida daromadni haqiqatan oshirgan biror ish qildingizmi.",
    },
    rhythm: 'quarterly',
    videos: ['007'],
  },
  {
    key: 'money-tsel-nakopleniy',
    title: {
      ru: 'Цель накоплений',
      uz: "Jamg'arma maqsadi",
    },
    why: {
      ru: 'Без цели деньги не накапливаются — они «остаются» и тратятся.',
      uz: "Maqsadsiz pul jamg'arilmaydi — u shunchaki «qoladi» va sarflanadi.",
    },
    rhythm: 'setup',
    videos: ['074'],
  },
  {
    key: 'money-podushka-bezopasnosti',
    title: {
      ru: 'Подушка безопасности',
      uz: "Xavfsizlik yostig'i",
    },
    why: {
      ru: 'Три-четыре месяца жизни. Для вас это двойная защита: личная подушка отдельно от резерва бизнеса, потому что при спаде в деле проседает и то и другое одновременно.',
      uz: "Uch-to'rt oylik hayot. Siz uchun bu ikki qavatli himoya: shaxsiy yostiq biznes zaxirasidan alohida, chunki ishdagi pasayishda ikkalasi bir vaqtda cho'kadi.",
    },
    rhythm: 'setup',
    videos: ['026', '074'],
  },
  {
    key: 'money-otkladyvat-dolyu-s-lyubogo-dohoda',
    title: {
      ru: 'Откладывать долю с любого дохода',
      uz: "Har qanday daromaddan ulush ajratish",
    },
    why: {
      ru: 'Канал называет разные доли — от 5–10% до 10–15%, — но принцип один: фиксированный процент с любого поступления, автоматически и до трат, а не из остатка.',
      uz: "Kanal turli ulushlarni aytadi — 5–10% dan 10–15% gacha, — lekin tamoyil bitta: har qanday tushumdan belgilangan foiz, avtomatik va xarajatlardan oldin, qoldiqdan emas.",
    },
    rhythm: 'monthly',
    videos: ['007', '026', '060', '074'],
  },
  {
    key: 'money-avtopopolnenie',
    title: {
      ru: 'Автопополнение',
      uz: "Avtomatik to'ldirish",
    },
    why: {
      ru: 'Автоматический перевод снимает вопрос дисциплины.',
      uz: "Avtomatik o'tkazma intizom masalasini olib tashlaydi.",
    },
    rhythm: 'setup',
    videos: ['074'],
  },
  {
    key: 'money-tratit-menshe-chem-zarabatyvaesh',
    title: {
      ru: 'Тратить меньше, чем зарабатываешь',
      uz: "Topganingdan kam sarflash",
    },
    why: {
      ru: 'При любом уровне дохода. Канал добавляет наблюдение: рост дохода почти всегда съедается ростом трат, если это правило не соблюдать сознательно.',
      uz: "Daromadning istalgan darajasida. Kanal kuzatuv qo'shadi: bu qoidaga ongli amal qilinmasa, daromad o'sishini deyarli har doim xarajat o'sishi yeb qo'yadi.",
    },
    rhythm: 'principle',
    videos: ['026'],
  },
  {
    key: 'money-chestno-otvetit-pochemu-oni-poyavilis',
    title: {
      ru: 'Честно ответить, почему они появились',
      uz: "Ular nega paydo bo'lganiga halol javob bering",
    },
    why: {
      ru: 'Без этого долги вернутся после погашения.',
      uz: "Busiz qarzlar to'langanidan keyin qaytadi.",
    },
    rhythm: 'principle',
    videos: ['049'],
  },
  {
    key: 'money-polnaya-tablitsa-kreditorov',
    title: {
      ru: 'Полная таблица кредиторов',
      uz: "Kreditorlarning to'liq jadvali",
    },
    why: {
      ru: 'Все долги в одном месте, с суммами, ставками и сроками. Плюс реальные расходы, включая подписки — то, что обычно не считают.',
      uz: "Barcha qarzlar bir joyda: summalar, stavkalar va muddatlar bilan. Ustiga haqiqiy xarajatlar, obunalarni ham qo'shib — odatda hisobga olinmaydiganlari.",
    },
    rhythm: 'monthly',
    videos: ['049'],
  },
  {
    key: 'money-byt-na-svyazi-i-prosit-o',
    title: {
      ru: 'Быть на связи и просить о послаблениях',
      uz: "Aloqada bo'ling va yengillik so'rang",
    },
    why: {
      ru: 'Кредиторы почти всегда идут навстречу тому, кто выходит на разговор сам. Определить, кто настроен жёстко, а кто готов ждать, — та же приоритизация, что в платёжном календаре.',
      uz: "Kreditorlar o'zi suhbatga chiqqanga deyarli har doim yon beradi. Kim qattiq turgan, kim kutishga tayyorligini aniqlash — to'lov kalendaridagi kabi ustuvorlash.",
    },
    rhythm: 'principle',
    videos: ['049'],
  },
  {
    key: 'money-dve-strategii-pogasheniya',
    title: {
      ru: 'Две стратегии погашения',
      uz: "To'lashning ikki strategiyasi",
    },
    why: {
      ru: '«Лавина» — сначала самый дорогой по проценту, математически выгоднее. «Снежный ком» — от меньшего к большему, психологически легче за счёт быстрых побед.',
      uz: "«Ko'chki» — avval foizi eng qimmati, matematik jihatdan foydaliroq. «Qor to'pi» — kichigidan kattasiga, tez g'alabalar hisobiga psixologik yengilroq.",
    },
    rhythm: 'principle',
    videos: ['049'],
  },
  {
    key: 'money-kogda-zanimat-mozhno',
    title: {
      ru: 'Когда занимать можно',
      uz: "Qachon qarz olish mumkin",
    },
    why: {
      ru: 'Только под то, что увеличит доход. Кредит — это деньги из будущего, и брать их на базовые потребности означает, что проблема не в деньгах, а в доходе.',
      uz: "Faqat daromadni oshiradigan narsaga. Kredit — kelajakdan olingan pul, uni asosiy ehtiyojlarga olish muammo pulda emas, daromadda ekanini bildiradi.",
    },
    rhythm: 'principle',
    videos: ['049', '057'],
  },
  {
    key: 'money-pravilo-odnoy-treti',
    title: {
      ru: 'Правило одной трети',
      uz: "Uchdan bir qoidasi",
    },
    why: {
      ru: 'Платежи по долгам — не более трети дохода.',
      uz: "Qarz to'lovlari daromadning uchdan biridan oshmasin.",
    },
    rhythm: 'principle',
    videos: ['049'],
  },
  {
    key: 'money-tolko-svoi-dengi',
    title: {
      ru: 'Только свои деньги',
      uz: "Faqat o'z puling",
    },
    why: {
      ru: 'Инвестировать заёмное — нет.',
      uz: "Qarzga olingan pulni investitsiya qilish — yo'q.",
    },
    rhythm: 'principle',
    videos: ['060'],
  },
  {
    key: 'money-ne-derzhat-svobodnye-dengi-bez-dvizheniya',
    title: {
      ru: 'Не держать свободные деньги без движения',
      uz: "Bo'sh pulni harakatsiz ushlamang",
    },
    why: {
      ru: 'Инфляция обесценивает лежащее. Особенно при высокой инфляции — а это ровно ваш контекст.',
      uz: "Inflyatsiya yotgan pulni qadrsizlantiradi. Ayniqsa yuqori inflyatsiyada — bu aynan sizning sharoitingiz.",
    },
    rhythm: 'principle',
    videos: ['022', '060', '074'],
  },
  {
    key: 'money-diversifikatsiya',
    title: {
      ru: 'Диверсификация',
      uz: "Diversifikatsiya",
    },
    why: {
      ru: 'Распределять между инструментами, валютами, банками; не вкладывать всё в одну компанию. Крупные суммы разносить по разным банкам.',
      uz: "Vositalar, valyutalar, banklar o'rtasida taqsimlash; hammasini bitta kompaniyaga qo'ymaslik. Yirik summalarni turli banklarga tarqatish.",
    },
    rhythm: 'principle',
    videos: ['022', '060', '074'],
  },
  {
    key: 'money-ne-prinimat-resheniy-v-panike',
    title: {
      ru: 'Не принимать решений в панике',
      uz: "Vahimada qaror qabul qilmang",
    },
    why: {
      ru: 'На падении продают те, кто продавать не собирался. Решение в панике закрепляет убыток, а не спасает от него.',
      uz: "Pasayishda sotmoqchi bo'lmaganlar sotadi. Vahimadagi qaror zararni mustahkamlaydi, undan qutqarmaydi.",
    },
    rhythm: 'principle',
    videos: ['060'],
  },
  {
    key: 'money-proizvodnye-instrumenty-ne-dlya-nachinayuschih',
    title: {
      ru: 'Производные инструменты — не для начинающих',
      uz: "Hosilaviy vositalar — boshlovchilar uchun emas",
    },
    why: {
      ru: 'Фьючерсы и опционы — не «акции побыстрее», а плечо: обнуляет счёт быстрее, чем приносит.',
      uz: "Fyucherslar va opsionlar — «tezroq aksiya» emas, yelka: hisobni daromad keltirgandan tezroq nolga tushiradi.",
    },
    rhythm: 'principle',
    videos: ['060'],
  },
  {
    key: 'money-obezyaniy-portfel',
    title: {
      ru: 'Обезьяний портфель',
      uz: "Maymun portfeli",
    },
    why: {
      ru: 'Известный эксперимент со случайно собранным портфелем, обогнавшим профессиональные фонды, приводится как аргумент против веры в непогрешимость управляющих.',
      uz: "Tasodifan yig'ilgan portfel professional fondlarni ortda qoldirgan mashhur tajriba boshqaruvchilarning xatosizligiga ishonishga qarshi dalil sifatida keltiriladi.",
    },
    rhythm: 'principle',
    videos: ['022'],
  },
  {
    key: 'money-dolg-pri-vysokoy-inflyatsii',
    title: {
      ru: 'Долг при высокой инфляции',
      uz: "Yuqori inflyatsiyada qarz",
    },
    why: {
      ru: 'Фиксированный долг обесценивается вместе с деньгами — заёмщик в выигрыше, если доход растёт вместе с инфляцией.',
      uz: "Belgilangan qarz pul bilan birga qadrsizlanadi — daromad inflyatsiya bilan birga o'ssa, qarz oluvchi yutadi.",
    },
    rhythm: 'principle',
    videos: ['022'],
  },
  {
    key: 'money-vysokaya-stavka-smotret-na-vklady',
    title: {
      ru: 'Высокая ставка — смотреть на вклады',
      uz: "Stavka yuqori bo'lsa — omonatlarga qarang",
    },
    why: {
      ru: 'Когда ставка высокая, вклад даёт доход без риска. Искать доходность выше имеет смысл, когда она низкая.',
      uz: "Stavka yuqori bo'lganda omonat xavfsiz daromad beradi. Undan yuqori daromadlilik izlash stavka past bo'lganda ma'noga ega.",
    },
    rhythm: 'principle',
    videos: ['022'],
  },
  {
    key: 'money-printsip-svoevremennogo',
    title: {
      ru: 'Принцип «своевременного»',
      uz: "«O'z vaqtidalik» tamoyili",
    },
    why: {
      ru: 'В экономике важен не только выбор, но и момент.',
      uz: "Iqtisodda nafaqat tanlov, balki payt ham muhim.",
    },
    rhythm: 'principle',
    videos: ['022'],
  },
  {
    key: 'money-ne-stroit-prognoz-po-odnomu-pokazatelyu',
    title: {
      ru: 'Не строить прогноз по одному показателю',
      uz: "Bitta ko'rsatkich bo'yicha prognoz qurmang",
    },
    why: {
      ru: 'И не ждать «справедливости» от макроэкономики — она не про справедливость.',
      uz: "Va makroiqtisoddan «adolat» kutmang — u adolat haqida emas.",
    },
    rhythm: 'principle',
    videos: ['022'],
  },
  {
    key: 'money-administrativnye-tarify',
    title: {
      ru: 'Административные тарифы',
      uz: "Ma'muriy tariflar",
    },
    why: {
      ru: 'Часть цен устанавливается не рынком. Для вас это электричество — существенная статья при досветке, и её изменения от вас не зависят.',
      uz: "Narxlarning bir qismini bozor belgilamaydi. Siz uchun bu elektr — yoritishda sezilarli modda, va uning o'zgarishi sizga bog'liq emas.",
    },
    rhythm: 'principle',
    videos: ['022'],
  },
  {
    key: 'money-byt-zametnym-a-ne-tolko-horoshim',
    title: {
      ru: 'Быть заметным, а не только хорошим',
      uz: "Ko'rinarli bo'ling, faqat yaxshi emas",
    },
    why: {
      ru: 'Социальное доказательство: платят не лучшему, а тому, о ком слышали. Отсюда чек-лист заметности — отрепетированная самопрезентация на полминуты, накопление касаний, собранные отзывы и цифры.',
      uz: "Ijtimoiy isbot: eng yaxshisiga emas, eshitganlariga to'laydilar. Shundan ko'rinarlilik ro'yxati: yarim daqiqalik mashq qilingan o'z-o'zini taqdim etish, tegishlarni to'plash, yig'ilgan sharhlar va raqamlar.",
    },
    rhythm: 'principle',
    videos: ['026'],
  },
  {
    key: 'money-zavist-kak-diagnostika',
    title: {
      ru: 'Зависть как диагностика',
      uz: "Hasad — tashxis vositasi",
    },
    why: {
      ru: 'Зависть — сигнал о собственной невыраженной цели, а не порок. Трёхшаговая работа: заметить, определить, чего именно хочется, превратить в задачу.',
      uz: "Hasad — illat emas, o'zingizning aytilmagan maqsadingiz haqidagi signal. Uch qadamli ish: sezish, aynan nima xohlayotganingizni aniqlash, vazifaga aylantirish.",
    },
    rhythm: 'principle',
    videos: ['026'],
  },
  {
    key: 'money-otvetstvennost-za-svoe-polozhenie',
    title: {
      ru: 'Ответственность за своё положение',
      uz: "O'z ahvoling uchun javobgarlik",
    },
    why: {
      ru: 'Признание своей роли в текущем положении — то, что отличает мышление на изменение от мышления на жалобу.',
      uz: "Hozirgi ahvolda o'z rolini tan olish — o'zgarishga qaratilgan tafakkurni shikoyatga qaratilganidan ajratadigan narsa.",
    },
    rhythm: 'principle',
    videos: ['057'],
  },
  {
    key: 'money-globalnaya-tsel-kak-filtr',
    title: {
      ru: 'Глобальная цель как фильтр',
      uz: "Global maqsad — filtr sifatida",
    },
    why: {
      ru: 'Сверять с ней покупки и решения.',
      uz: "Xaridlar va qarorlarni u bilan solishtiring.",
    },
    rhythm: 'principle',
    videos: ['057'],
  },
  {
    key: 'money-gotovnost-prosest-radi-rosta',
    title: {
      ru: 'Готовность просесть ради роста',
      uz: "O'sish uchun cho'kishga tayyorlik",
    },
    why: {
      ru: 'Отказ от сиюминутной выгоды и осознанный риск — то же, что просадка дохода при первом найме.',
      uz: "Bir zumlik foydadan voz kechish va ongli tavakkal — birinchi yollashdagi daromad pasayishi bilan bir xil.",
    },
    rhythm: 'principle',
    videos: ['057'],
  },
  {
    key: 'money-vsegda-naydetsya-bolee-silnyy',
    title: {
      ru: 'Всегда найдётся более сильный',
      uz: "Har doim kuchliroq topiladi",
    },
    why: {
      ru: 'Отрезвляющая мысль против сравнения с другими. Плюс наблюдение об иллюзии исключений: видны только те, у кого получилось.',
      uz: "Boshqalar bilan solishtirishga qarshi hushyor qiladigan fikr. Ustiga istisnolar illyuziyasi haqidagi kuzatuv: faqat uddalaganlari ko'rinadi.",
    },
    rhythm: 'principle',
    videos: ['026', '057'],
  },
  {
    key: 'money-dlinnaya-distantsiya',
    title: {
      ru: 'Длинная дистанция',
      uz: "Uzoq masofa",
    },
    why: {
      ru: 'Канал завершает этим: деньги приходят к тем, кто настроен на марафон, а не на спринт.',
      uz: "Kanal shu bilan yakunlaydi: pul sprintga emas, marafonga sozlanganlarga keladi.",
    },
    rhythm: 'principle',
    videos: ['026'],
  },
  {
    key: 'money-torg-kak-navyk',
    title: {
      ru: 'Торг как навык',
      uz: "Savdolashish — ko'nikma",
    },
    why: {
      ru: 'Уместен чаще, чем кажется — и в личных покупках, и в закупках для дела.',
      uz: "O'ylanganidan ko'ra ko'proq o'rinli — shaxsiy xaridlarda ham, ish uchun xaridlarda ham.",
    },
    rhythm: 'principle',
    videos: ['074'],
  },
];
