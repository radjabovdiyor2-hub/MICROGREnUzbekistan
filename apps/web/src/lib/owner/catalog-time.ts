import type { Practice } from './practices';

// Практики области «Время и состояние».
//
// Содержимое, а не логика: вытащено из разбора канала, где за каждой
// строкой стоит несколько советов. Ритм — предположение, и владелец
// меняет его на экране: своя неделя виднее отсюда.

export const TIME_PRACTICES: Practice[] = [
  {
    key: 'time-odin-prioritet-vmesto-spiska',
    title: {
      ru: 'Один приоритет вместо списка',
      uz: "Ro'yxat o'rniga bitta ustuvorlik",
    },
    why: {
      ru: 'Сначала приоритет, потом расписание. Список приоритетов — это отсутствие приоритета.',
      uz: "Avval ustuvorlik, keyin jadval. Ustuvorliklar ro'yxati — bu ustuvorlikning yo'qligi.",
    },
    rhythm: 'daily',
    videos: ['002', '089'],
  },
  {
    key: 'time-matritsa-srochnosti-i-vazhnosti',
    title: {
      ru: 'Матрица срочности и важности',
      uz: "Shoshilinchlik va muhimlik matritsasi",
    },
    why: {
      ru: 'Главная мысль — защищать квадрат важного и несрочного: он развивает дело, но никогда не горит, поэтому съедается срочным.',
      uz: "Asosiy fikr — muhim, ammo shoshilinch bo'lmagan kvadratni himoya qilish: u ishni rivojlantiradi, lekin hech qachon yonmaydi, shuning uchun shoshilinchlar uni yeb qo'yadi.",
    },
    rhythm: 'principle',
    videos: ['064', '088'],
  },
  {
    key: 'time-zapolnyat-raspisanie-samomu',
    title: {
      ru: 'Заполнять расписание самому',
      uz: "Jadvalni o'zingiz to'ldiring",
    },
    why: {
      ru: 'Иначе его заполнят другие. Каждое новое «да» стоит прогонять через вопрос, чему вы этим говорите «нет».',
      uz: "Aks holda uni boshqalar to'ldiradi. Har bir yangi «ha» ni «shu bilan nimaga yo'q deyapman» savolidan o'tkazish kerak.",
    },
    rhythm: 'setup',
    videos: ['002'],
  },
  {
    key: 'time-otkazyvat-i-sebe-tozhe',
    title: {
      ru: 'Отказывать — и себе тоже',
      uz: "Rad eting — o'zingizga ham",
    },
    why: {
      ru: '«Я загружен» без оправданий — достаточный ответ. А отказ самому себе канал называет самым недооценённым: новые идеи отвлекают сильнее чужих просьб.',
      uz: "«Bandman» — oqlovsiz ham yetarli javob. O'ziga rad javobini esa kanal eng kam baholangani deydi: yangi g'oyalar begona iltimoslardan kuchliroq chalg'itadi.",
    },
    rhythm: 'principle',
    videos: ['064'],
  },
  {
    key: 'time-schitat-chey-chas-deshevle',
    title: {
      ru: 'Считать, чей час дешевле',
      uz: "Kimning soati arzonroq — hisoblang",
    },
    why: {
      ru: 'Прямой критерий: если час помощника дешевле вашего часа на той же работе — задача передаётся.',
      uz: "To'g'ridan-to'g'ri mezon: agar yordamchining soati o'sha ishda sizning soatingizdan arzon bo'lsa — vazifa topshiriladi.",
    },
    rhythm: 'principle',
    videos: ['064'],
  },
  {
    key: 'time-planirovat-kvartalami-i-sveryatsya-ezhenedelno',
    title: {
      ru: 'Планировать кварталами и сверяться еженедельно',
      uz: "Choraklab rejalashtiring va har hafta solishtiring",
    },
    why: {
      ru: 'Три месяца — горизонт, который виден и при этом не превращается в фантазию. Четыре шага: цели на квартал, тактика, разбивка по неделям, еженедельная сверка.',
      uz: "Uch oy — ko'rinadigan, ammo xayolga aylanmaydigan ufq. To'rt qadam: chorak maqsadlari, taktika, haftalarga bo'lish, haftalik solishtiruv.",
    },
    rhythm: 'weekly',
    videos: ['036', '088'],
  },
  {
    key: 'time-razbivat-na-shagi-i-planirovat-den',
    title: {
      ru: 'Разбивать на шаги и планировать день',
      uz: "Qadamlarga bo'lish va kunni rejalashtirish",
    },
    why: {
      ru: 'Дробление до уровня дня: месяц',
      uz: "Kun darajasigacha maydalash: oy",
    },
    rhythm: 'daily',
    videos: ['036', '062', '088'],
  },
  {
    key: 'time-zapisyvat-vse-i-derzhat-spisok-na',
    title: {
      ru: 'Записывать всё и держать список на виду',
      uz: "Hammasini yozib boring va ro'yxatni ko'z oldida tuting",
    },
    why: {
      ru: 'Принцип «ничего не держать в голове»: голова нужна для выполнения задач, а не для их хранения.',
      uz: "«Boshda hech narsa saqlamaslik» tamoyili: bosh vazifalarni bajarish uchun kerak, ularni saqlash uchun emas.",
    },
    rhythm: 'daily',
    videos: ['064', '106'],
  },
  {
    key: 'time-kalendar-so-vsem-vklyuchaya-dorogu-i',
    title: {
      ru: 'Календарь со всем, включая дорогу и отдых',
      uz: "Yo'l va dam olish ham kiradigan kalendar",
    },
    why: {
      ru: 'Заложить время на дорогу и раскачку, внести еду и отдых. Для вас доставка по нескольким заведениям — это дорога, ожидание, разгрузка: если планировать только время у клиента, день разваливается к третьей точке.',
      uz: "Yo'l va tebranishga vaqt ajrating, ovqat va dam olishni kiriting. Siz uchun bir necha muassasaga yetkazish — bu yo'l, kutish, tushirish: faqat mijozdagi vaqtni rejalashtirsangiz, kun uchinchi nuqtaga borib sochiladi.",
    },
    rhythm: 'principle',
    videos: ['106'],
  },
  {
    key: 'time-ne-stavit-zadachi-vprityk-i-ostavlyat',
    title: {
      ru: 'Не ставить задачи впритык и оставлять окна',
      uz: "Vazifalarni zich qo'ymang, oyna qoldiring",
    },
    why: {
      ru: 'Без промежутков любая задержка ломает весь день. Незаполненные окна — не потеря, а страховка.',
      uz: "Oraliqsiz har qanday kechikish butun kunni buzadi. To'ldirilmagan oynalar — yo'qotish emas, sug'urta.",
    },
    rhythm: 'daily',
    videos: ['064', '088'],
  },
  {
    key: 'time-gruppirovat-odnotipnoe',
    title: {
      ru: 'Группировать однотипное',
      uz: "Bir turdagilarni guruhlang",
    },
    why: {
      ru: 'Письма, звонки, сообщения — закрывать блоками, а не по мере поступления. Немедленная реакция на входящее разрушает работу.',
      uz: "Xatlar, qo'ng'iroqlar, xabarlar — kelgan sari emas, bloklar bilan yoping. Kiruvchiga zudlik bilan javob berish ishni buzadi.",
    },
    rhythm: 'principle',
    videos: ['064'],
  },
  {
    key: 'time-stavit-realnye-tseli-i-zakladyvat-realnye',
    title: {
      ru: 'Ставить реальные цели и закладывать реальные сроки',
      uz: "Haqiqiy maqsad qo'ying va haqiqiy muddat ajrating",
    },
    why: {
      ru: 'Оптимистичная оценка срока — норма, поэтому запас обязателен. А начинать раньше стоит хотя бы для того, чтобы узнать настоящий объём работы.',
      uz: "Muddatni optimistik baholash — odatiy hol, shuning uchun zaxira majburiy. Erta boshlash esa hech bo'lmasa ishning haqiqiy hajmini bilish uchun kerak.",
    },
    rhythm: 'principle',
    videos: ['036'],
  },
  {
    key: 'time-otlichat-rabotu-ot-zanyatosti',
    title: {
      ru: 'Отличать работу от занятости',
      uz: "Ishni bandlikdan ajrating",
    },
    why: {
      ru: 'Канал разводит два состояния: сложная работа, которая двигает дело, и рутинная занятость, которая создаёт ощущение продуктивности.',
      uz: "Kanal ikki holatni ajratadi: ishni oldinga suradigan murakkab ish va unumdorlik tuyg'usini yaratadigan kundalik bandlik.",
    },
    rhythm: 'weekly',
    videos: ['064'],
  },
  {
    key: 'time-svoy-ritm-i-adaptatsiya-pod-sostoyanie',
    title: {
      ru: 'Свой ритм и адаптация под состояние',
      uz: "O'z ritmingiz va holatga moslashuv",
    },
    why: {
      ru: 'Определить пики активности и ставить сложное на них. План подстраивается под самочувствие, а не наоборот.',
      uz: "Faollik cho'qqilarini aniqlab, murakkabini o'shanga qo'ying. Reja kayfiyatga moslashadi, aksincha emas.",
    },
    rhythm: 'principle',
    videos: ['062', '088'],
  },
  {
    key: 'time-otdyh-v-plan-naravne-s-zadachami',
    title: {
      ru: 'Отдых — в план наравне с задачами',
      uz: "Dam olish — rejaga vazifalar bilan teng",
    },
    why: {
      ru: 'Отдых как обязанность, а не награда за выполненное. При ежедневном цикле это единственный способ, которым он вообще случится.',
      uz: "Dam olish mukofot emas, majburiyat. Kundalik siklda u umuman yuz berishining yagona yo'li shu.",
    },
    rhythm: 'principle',
    videos: ['014', '088'],
  },
  {
    key: 'time-nachat-s-voprosa-chego-vy-deystvitelno',
    title: {
      ru: 'Начать с вопроса, чего вы действительно хотите',
      uz: "Aslida nima xohlashingiz savolidan boshlang",
    },
    why: {
      ru: 'Описать желаемую жизнь и записать, зачем нужна цель. Связь с ценностями — то, что удерживает, когда становится трудно.',
      uz: "Istagan hayotingizni tasvirlang va maqsad nega kerakligini yozing. Qadriyatlar bilan bog'liqlik — qiyin bo'lganda ushlab turadigan narsa.",
    },
    rhythm: 'principle',
    videos: ['089'],
  },
  {
    key: 'time-proverit-na-adekvatnost-i-dat-otlezhatsya',
    title: {
      ru: 'Проверить на адекватность и дать отлежаться',
      uz: "Haqqoniylikka tekshiring va yotib tursin",
    },
    why: {
      ru: 'Разрыв между желаемым и возможным оценивается трезво, а список целей перечитывается через несколько дней — часть отпадает сама.',
      uz: "Istak bilan imkoniyat orasidagi tafovut hushyor baholanadi, maqsadlar ro'yxati esa bir necha kundan keyin qayta o'qiladi — bir qismi o'zi tushib qoladi.",
    },
    rhythm: 'principle',
    videos: ['089'],
  },
  {
    key: 'time-kriteriy-dostizheniya',
    title: {
      ru: 'Критерий достижения',
      uz: "Erishish mezoni",
    },
    why: {
      ru: 'Формулировка должна показывать момент достижения. «Развивать сбыт» — не цель; «двадцать активных заведений к концу квартала» — цель.',
      uz: "Ta'rif erishish paytini ko'rsatishi kerak. «Sotuvni rivojlantirish» — maqsad emas; «chorak oxiriga yigirmata faol muassasa» — maqsad.",
    },
    rhythm: 'principle',
    videos: ['089'],
  },
  {
    key: 'time-peresmatrivat-i-ne-stavit-mnogo-srazu',
    title: {
      ru: 'Пересматривать и не ставить много сразу',
      uz: "Qayta ko'rib chiqing va birdaniga ko'pini qo'ymang",
    },
    why: {
      ru: 'Обстоятельства меняются; параллельные цели растаскивают силы.',
      uz: "Sharoit o'zgaradi; parallel maqsadlar kuchni tortqilaydi.",
    },
    rhythm: 'monthly',
    videos: ['062', '089'],
  },
  {
    key: 'time-tseli-ne-tolko-po-biznesu',
    title: {
      ru: 'Цели не только по бизнесу',
      uz: "Maqsadlar faqat biznes bo'yicha emas",
    },
    why: {
      ru: 'Единственная опора — уязвимая конструкция. Если всё держится на деле, любой спад в нём обрушивает всё сразу.',
      uz: "Yagona tayanch — zaif tuzilma. Hammasi ishga tayansa, undagi har qanday pasayish hammasini birdan qulatadi.",
    },
    rhythm: 'quarterly',
    videos: ['012', '089'],
  },
  {
    key: 'time-razreshit-sebe-periody-bez-tseley',
    title: {
      ru: 'Разрешить себе периоды без целей',
      uz: "O'zingizga maqsadsiz davrlarga ruxsat bering",
    },
    why: {
      ru: 'Не жертвовать настоящим ради негарантированного будущего. Отсутствие целей — не провал; культ достижений канал разбирает отдельно.',
      uz: "Kafolatlanmagan kelajak uchun bugunni qurbon qilmang. Maqsadlarning yo'qligi — muvaffaqiyatsizlik emas; yutuqlar kultini kanal alohida ko'rib chiqadi.",
    },
    rhythm: 'principle',
    videos: ['089'],
  },
  {
    key: 'time-ne-putat-sotsialnye-sroki-s-nastoyaschimi',
    title: {
      ru: 'Не путать социальные сроки с настоящими',
      uz: "Ijtimoiy muddatlarni haqiqiylari bilan aralashtirmang",
    },
    why: {
      ru: 'Соотносить риск с ценой года и не принимать чужие представления о том, что «пора», за собственные.',
      uz: "Tavakkalni yil narxi bilan solishtiring va «payti keldi» haqidagi begona tasavvurlarni o'zingiznikidek qabul qilmang.",
    },
    rhythm: 'principle',
    videos: ['002'],
  },
  {
    key: 'time-motivatsiya-zakanchivaetsya-distsiplina-ostaetsya',
    title: {
      ru: 'Мотивация заканчивается, дисциплина остаётся',
      uz: "Motivatsiya tugaydi, intizom qoladi",
    },
    why: {
      ru: 'Решение принимается один раз, а не каждое утро заново. Это и есть разница между мотивацией и дисциплиной.',
      uz: "Qaror bir marta qabul qilinadi, har tong qaytadan emas. Motivatsiya bilan intizom orasidagi farq shu.",
    },
    rhythm: 'principle',
    videos: ['062'],
  },
  {
    key: 'time-inventarizatsiya-dnya',
    title: {
      ru: 'Инвентаризация дня',
      uz: "Kun inventarizatsiyasi",
    },
    why: {
      ru: 'Выписать, из чего состоит день. Обычно выясняется, что времени нет не там, где казалось.',
      uz: "Kun nimalardan iboratligini yozib chiqing. Odatda vaqt o'ylangan joyda emasligi ma'lum bo'ladi.",
    },
    rhythm: 'daily',
    videos: ['058'],
  },
  {
    key: 'time-sdelat-nuzhnoe-ochevidnym-i-vidimym',
    title: {
      ru: 'Сделать нужное очевидным и видимым',
      uz: "Kerakli narsani ravshan va ko'rinadigan qiling",
    },
    why: {
      ru: 'Формулировка без разночтений и предмет-напоминание на виду.',
      uz: "Ikki xil o'qilmaydigan ta'rif va ko'z oldidagi eslatuvchi buyum.",
    },
    rhythm: 'principle',
    videos: ['058'],
  },
  {
    key: 'time-zonirovat-prostranstvo',
    title: {
      ru: 'Зонировать пространство',
      uz: "Maydonni zonalarga bo'ling",
    },
    why: {
      ru: 'Отдельное место под каждое занятие. В производстве это переводится напрямую: посевная, стеллажи, промывка, фасовка — разделённые зоны запускают действие сами и снижают брак.',
      uz: "Har bir mashg'ulotga alohida joy. Ishlab chiqarishda bu to'g'ridan-to'g'ri tarjima qilinadi: ekish, stellajlar, yuvish, qadoqlash — ajratilgan zonalar harakatni o'zi boshlaydi va brakni kamaytiradi.",
    },
    rhythm: 'setup',
    videos: ['058'],
  },
  {
    key: 'time-tseplyat-novoe-k-suschestvuyuschemu',
    title: {
      ru: 'Цеплять новое к существующему',
      uz: "Yangisini mavjudiga ulang",
    },
    why: {
      ru: 'Новая привычка привязывается к уже устоявшейся. Проверка нового заведения по списку — сразу после утреннего обхода лотков.',
      uz: "Yangi odat allaqachon o'rnashganiga bog'lanadi. Yangi muassasani ro'yxat bo'yicha tekshirish — ertalabki lotok aylanmasidan keyin darrov.",
    },
    rhythm: 'principle',
    videos: ['023', '058'],
  },
  {
    key: 'time-pravilo-dvuh-minut-i-minimalnaya-versiya',
    title: {
      ru: 'Правило двух минут и минимальная версия',
      uz: "Ikki daqiqa qoidasi va eng kichik versiya",
    },
    why: {
      ru: 'В плохой день — сокращённая версия вместо пропуска. Пропуск разрушает цепочку, а минимальная версия её держит.',
      uz: "Yomon kunda — o'tkazib yuborish o'rniga qisqartirilgan versiya. O'tkazib yuborish zanjirni buzadi, eng kichik versiya esa uni ushlab turadi.",
    },
    rhythm: 'principle',
    videos: ['058'],
  },
  {
    key: 'time-soedinyat-poleznoe-s-priyatnym',
    title: {
      ru: 'Соединять полезное с приятным',
      uz: "Foydalini yoqimlisi bilan qo'shing",
    },
    why: {
      ru: 'Награда соразмерная и сразу. Искать удовольствие в самом процессе — на длинной дистанции только это и работает.',
      uz: "Mukofot mos va darrov. Zavqni jarayonning o'zidan izlash — uzoq masofada faqat shu ishlaydi.",
    },
    rhythm: 'principle',
    videos: ['058', '062'],
  },
  {
    key: 'time-ne-otkladyvat-udovletvorenie-do-rezultata',
    title: {
      ru: 'Не откладывать удовлетворение до результата',
      uz: "Qoniqishni natijagacha kechiktirmang",
    },
    why: {
      ru: 'Радость, отложенная до цели, не наступает: у достигнутой цели сразу находится следующая.',
      uz: "Maqsadgacha kechiktirilgan quvonch kelmaydi: erishilgan maqsadga darrov keyingisi topiladi.",
    },
    rhythm: 'principle',
    videos: ['023', '058'],
  },
  {
    key: 'time-ustranyat-prichinu-a-ne-sledstvie',
    title: {
      ru: 'Устранять причину, а не следствие',
      uz: "Sababni bartaraf eting, oqibatni emas",
    },
    why: {
      ru: 'И проверять, к той ли цели ведут привычки. Дисциплина, направленная не туда, дороже её отсутствия.',
      uz: "Va odatlar o'sha maqsadga olib borayotganini tekshiring. Noto'g'ri yo'naltirilgan intizom uning yo'qligidan qimmatga tushadi.",
    },
    rhythm: 'principle',
    videos: ['058'],
  },
  {
    key: 'time-ne-dovodit-do-oderzhimosti',
    title: {
      ru: 'Не доводить до одержимости',
      uz: "Ishtiyoqni vasvasaga aylantirmang",
    },
    why: {
      ru: 'Система, ставшая самоцелью, вредит. Начинать надо с самого простого доступного улучшения.',
      uz: "O'z-o'ziga maqsadga aylangan tizim zarar keltiradi. Boshlash eng oddiy mavjud yaxshilanishdan bo'lishi kerak.",
    },
    rhythm: 'principle',
    videos: ['058'],
  },
  {
    key: 'time-zona-rosta-a-ne-zona-paniki',
    title: {
      ru: 'Зона роста, а не зона паники',
      uz: "O'sish zonasi, vahima zonasi emas",
    },
    why: {
      ru: 'Цель должна быть выше привычного, но не парализующей.',
      uz: "Maqsad odatdagidan yuqori bo'lishi kerak, lekin falaj qiladigan darajada emas.",
    },
    rhythm: 'principle',
    videos: ['023'],
  },
  {
    key: 'time-vneshnie-obyazatelstva',
    title: {
      ru: 'Внешние обязательства',
      uz: "Tashqi majburiyatlar",
    },
    why: {
      ru: 'Публичное обещание, договорённость с кем-то, собственные последствия за срыв. Искусственная мотивация работает, когда естественная кончилась.',
      uz: "Ommaviy va'da, kimdir bilan kelishuv, buzilganiga o'z oqibatlaringiz. Sun'iy motivatsiya tabiiysi tugaganda ishlaydi.",
    },
    rhythm: 'principle',
    videos: ['023', '036'],
  },
  {
    key: 'time-otlichat-podgotovku-ot-deystviya',
    title: {
      ru: 'Отличать подготовку от действия',
      uz: "Tayyorgarlikni harakatdan ajrating",
    },
    why: {
      ru: 'Бесконечное изучение — форма прокрастинации. Снижать ценность цели и повышать ценность действия.',
      uz: "Cheksiz o'rganish — prokrastinatsiyaning bir ko'rinishi. Maqsad qiymatini pasaytirib, harakat qiymatini oshiring.",
    },
    rhythm: 'principle',
    videos: ['023'],
  },
  {
    key: 'time-delat-ploho-no-delat',
    title: {
      ru: 'Делать плохо, но делать',
      uz: "Yomon qiling, lekin qiling",
    },
    why: {
      ru: 'Первая версия не обязана быть хорошей. Та же мысль, что MVP в 09.',
      uz: "Birinchi versiya yaxshi bo'lishi shart emas. 09-dagi MVP bilan bir xil fikr.",
    },
    rhythm: 'principle',
    videos: ['023'],
  },
  {
    key: 'time-ne-rasskazyvat-o-planah-podrobno',
    title: {
      ru: 'Не рассказывать о планах подробно',
      uz: "Rejalar haqida batafsil gapirmang",
    },
    why: {
      ru: 'Подробный рассказ даёт психике ощущение, что дело уже сделано.',
      uz: "Batafsil hikoya ruhiyatga ish allaqachon bajarilgandek tuyg'u beradi.",
    },
    rhythm: 'principle',
    videos: ['062'],
  },
  {
    key: 'time-ne-zhdat-bystrogo-rezultata-i-stavit',
    title: {
      ru: 'Не ждать быстрого результата и ставить новую цель сразу',
      uz: "Tez natija kutmang va darrov yangi maqsad qo'ying",
    },
    why: {
      ru: 'Расслабление после достижения — известная ловушка. Набрав первый десяток заведений, легко решить, что сбыт налажен, и прекратить обходы.',
      uz: "Erishgandan keyingi bo'shashish — mashhur tuzoq. Birinchi o'nta muassasani yig'ib, sotuv yo'lga qo'yildi deb aylanmalarni to'xtatish oson.",
    },
    rhythm: 'principle',
    videos: ['062'],
  },
  {
    key: 'time-ogranichivat-otvlecheniya-tehnicheski',
    title: {
      ru: 'Ограничивать отвлечения технически',
      uz: "Chalg'ishlarni texnik cheklang",
    },
    why: {
      ru: 'Сила воли проигрывает уведомлению. Выключить его надёжнее, чем терпеть.',
      uz: "Iroda bildirishnomaga yutqazadi. Uni o'chirish chidashdan ishonchliroq.",
    },
    rhythm: 'setup',
    videos: ['062'],
  },
  {
    key: 'time-prinimat-kritiku-vyborochno-i-sravnivat-s',
    title: {
      ru: 'Принимать критику выборочно и сравнивать с собой прошлым',
      uz: "Tanqidni tanlab qabul qiling va o'tmishdagi o'zingiz bilan solishtiring",
    },
    why: {
      ru: 'Слушать тех, кто в теме. Сравнение с собой из прошлого вместо сравнения с другими.',
      uz: "Mavzuni bilganlarni tinglang. Boshqalar bilan emas, o'tmishdagi o'zingiz bilan solishtirish.",
    },
    rhythm: 'principle',
    videos: ['023'],
  },
  {
    key: 'time-prorabotat-hudshiy-stsenariy',
    title: {
      ru: 'Проработать худший сценарий',
      uz: "Eng yomon ssenariyni ishlab chiqing",
    },
    why: {
      ru: 'Детально представленный худший исход почти всегда оказывается переносимым — и страх падает.',
      uz: "Batafsil tasavvur qilingan eng yomon natija deyarli har doim chidasa bo'ladigan bo'lib chiqadi — va qo'rquv pasayadi.",
    },
    rhythm: 'quarterly',
    videos: ['023'],
  },
  {
    key: 'time-ne-zhdat-vdohnoveniya',
    title: {
      ru: 'Не ждать вдохновения',
      uz: "Ilhom kutmang",
    },
    why: {
      ru: 'Желание появляется в процессе, а не до него. Механика прокрастинации: боль вызывает не работа, а мысль о ней.',
      uz: "Istak jarayonda paydo bo'ladi, undan oldin emas. Prokrastinatsiya mexanikasi: og'riqni ish emas, u haqidagi fikr keltiradi.",
    },
    rhythm: 'principle',
    videos: ['036'],
  },
  {
    key: 'time-znat-svoy-tip-sryva-srokov',
    title: {
      ru: 'Знать свой тип срыва сроков',
      uz: "Muddatni buzish turingizni biling",
    },
    why: {
      ru: 'Перфекционист, оптимист, избегающий — у каждого свой сценарий. Плюс четыре искажения времени, из которых главное — «ещё много времени».',
      uz: "Perfeksionist, optimist, qochuvchi — har birining o'z ssenariysi. Ustiga vaqtning to'rt buzilishi, ulardan asosiysi — «hali vaqt ko'p».",
    },
    rhythm: 'setup',
    videos: ['036'],
  },
  {
    key: 'time-kalendar-zhizni',
    title: {
      ru: 'Календарь жизни',
      uz: "Hayot kalendari",
    },
    why: {
      ru: 'Поле, где каждая клетка — неделя жизни. Отрезвляющее упражнение, к которому канал возвращается дважды.',
      uz: "Har bir katakchasi hayotning bir haftasi bo'lgan maydon. Kanal ikki marta qaytadigan hushyor qiladigan mashq.",
    },
    rhythm: 'setup',
    videos: ['002', '036'],
  },
  {
    key: 'time-osoznannaya-praktika-a-ne-chasy',
    title: {
      ru: 'Осознанная практика, а не часы',
      uz: "Soatlar emas, ongli mashq",
    },
    why: {
      ru: 'Часы сами по себе не дают мастерства — нужна осознанная практика с обратной связью.',
      uz: "Soatlarning o'zi mahorat bermaydi — teskari aloqasi bor ongli mashq kerak.",
    },
    rhythm: 'principle',
    videos: ['002'],
  },
  {
    key: 'time-sostoyanie-potoka-i-vybor-puti-kotoryy',
    title: {
      ru: 'Состояние потока и выбор пути, который нравится',
      uz: "Oqim holati va yoqadigan yo'lni tanlash",
    },
    why: {
      ru: 'Порог интереса к самому пути, а не только к результату. Если процесс не нравится хотя бы наполовину, цель выбрана неверно.',
      uz: "Faqat natijaga emas, yo'lning o'ziga qiziqish ostonasi. Jarayon hech bo'lmasa yarmicha yoqmasa, maqsad noto'g'ri tanlangan.",
    },
    rhythm: 'principle',
    videos: ['002'],
  },
  {
    key: 'time-nevozvratnye-zatraty',
    title: {
      ru: 'Невозвратные затраты',
      uz: "Qaytmas xarajatlar",
    },
    why: {
      ru: 'Проверять, не тянете ли вы направление только потому, что уже вложились. Вложенное не вернётся в любом случае.',
      uz: "Faqat allaqachon sarflaganingiz uchun yo'nalishni tortib yurmayotganingizni tekshiring. Sarflangani baribir qaytmaydi.",
    },
    rhythm: 'principle',
    videos: ['002'],
  },
  {
    key: 'time-prav-plan-esli-postoyanno-ne-uspevaesh',
    title: {
      ru: 'Правь план, если постоянно не успеваешь',
      uz: "Doim ulgurmasangiz, rejani tuzating",
    },
    why: {
      ru: 'Систематическое невыполнение — признак плохого плана, а не слабой воли.',
      uz: "Muntazam bajarilmaslik — irodaning emas, rejaning yomonligi belgisi.",
    },
    rhythm: 'principle',
    videos: ['002'],
  },
  {
    key: 'time-schitat-pokupki-v-chasah-raboty',
    title: {
      ru: 'Считать покупки в часах работы',
      uz: "Xaridlarni ish soatlarida hisoblang",
    },
    why: {
      ru: 'Пересчёт цены в часы жизни меняет отношение к тратам.',
      uz: "Narxni hayot soatlariga o'tkazish xarajatlarga munosabatni o'zgartiradi.",
    },
    rhythm: 'principle',
    videos: ['002'],
  },
  {
    key: 'time-novizna-udlinyaet-subektivnoe-vremya',
    title: {
      ru: 'Новизна удлиняет субъективное время',
      uz: "Yangilik subyektiv vaqtni uzaytiradi",
    },
    why: {
      ru: 'Однообразные периоды сжимаются в памяти. При ежедневном цикле это заметно особенно: год повторяющихся недель проходит незаметно.',
      uz: "Bir xil davrlar xotirada siqiladi. Kundalik siklda bu ayniqsa seziladi: takrorlanuvchi haftalar yili sezilmay o'tadi.",
    },
    rhythm: 'principle',
    videos: ['002'],
  },
  {
    key: 'time-pauzy-bez-telefona',
    title: {
      ru: 'Паузы без телефона',
      uz: "Telefonsiz tanaffuslar",
    },
    why: {
      ru: 'Незаполненное время нужно голове. И не ждать подходящего момента — брать пятнадцать минут сегодня.',
      uz: "To'ldirilmagan vaqt boshga kerak. Va mos paytni kutmang — bugun o'n besh daqiqa oling.",
    },
    rhythm: 'daily',
    videos: ['002'],
  },
  {
    key: 'time-opredelit-tip-ustalosti',
    title: {
      ru: 'Определить тип усталости',
      uz: "Charchoq turini aniqlang",
    },
    why: {
      ru: 'Отдых подбирается под тип. Досуг — поход, концерт, поездка — не всегда отдых: он может добавлять нагрузку.',
      uz: "Dam olish turga qarab tanlanadi. Bo'sh vaqt — sayr, konsert, safar — har doim ham dam emas: u yukni oshirishi mumkin.",
    },
    rhythm: 'setup',
    videos: ['014'],
  },
  {
    key: 'time-vyyasnit-chto-imenno-vas-vosstanavlivaet',
    title: {
      ru: 'Выяснить, что именно вас восстанавливает',
      uz: "Aynan nima sizni tiklashini aniqlang",
    },
    why: {
      ru: 'Не то, что принято считать отдыхом, а то, после чего у вас появляются силы. Проверяется только опытом и записями.',
      uz: "Dam deb hisoblanadigan narsa emas, balki undan keyin sizda kuch paydo bo'ladigan narsa. Faqat tajriba va yozuvlar bilan tekshiriladi.",
    },
    rhythm: 'setup',
    videos: ['023'],
  },
  {
    key: 'time-derzhat-ryadom-teh-kto-tozhe-dvigaetsya',
    title: {
      ru: 'Держать рядом тех, кто тоже двигается',
      uz: "Yonda ham harakatlanayotganlarni tuting",
    },
    why: {
      ru: 'Среда влияет на темп сильнее дисциплины. Для работающего в одиночку это особенно важно — см.',
      uz: "Muhit sur'atga intizomdan kuchliroq ta'sir qiladi. Yolg'iz ishlayotgan uchun bu ayniqsa muhim — qarang.",
    },
    rhythm: 'principle',
    videos: ['088'],
  },
  {
    key: 'time-ubrat-iz-otdyha-otvetstvennost-i-noviznu',
    title: {
      ru: 'Убрать из отдыха ответственность и новизну',
      uz: "Dam olishdan javobgarlik va yangilikni olib tashlang",
    },
    why: {
      ru: 'Когда перегружены, отдых должен быть предсказуемым. Правило «рутина ↔ новизна»: погрязшему в рутине нужна новизна, перегруженному новым — рутина.',
      uz: "Ortiqcha yuklanganda dam olish oldindan bilinadigan bo'lishi kerak. «Rutina ↔ yangilik» qoidasi: rutinaga botganga yangilik, yangilikdan charchaganga rutina kerak.",
    },
    rhythm: 'principle',
    videos: ['014'],
  },
  {
    key: 'time-baza-son-i-pitanie',
    title: {
      ru: 'База: сон и питание',
      uz: "Asos: uyqu va ovqat",
    },
    why: {
      ru: 'Восемь часов сна и нормальная еда — не роскошь, а условие работоспособности. Режим дня: сон, регулярная еда, тепло.',
      uz: "Sakkiz soat uyqu va normal ovqat — hashamat emas, ish qobiliyatining sharti. Kun tartibi: uyqu, muntazam ovqat, issiqlik.",
    },
    rhythm: 'daily',
    videos: ['014', '108'],
  },
  {
    key: 'time-bluzhdayuschee-vnimanie-i-progulki',
    title: {
      ru: 'Блуждающее внимание и прогулки',
      uz: "Sayr qiluvchi diqqat va piyoda yurish",
    },
    why: {
      ru: 'Состояние, в котором голова восстанавливается. Ежедневная прогулка — даже короткая — работает.',
      uz: "Bosh tiklanadigan holat. Kundalik sayr — hatto qisqasi ham — ishlaydi.",
    },
    rhythm: 'weekly',
    videos: ['014'],
  },
  {
    key: 'time-zanyat-ruki',
    title: {
      ru: 'Занять руки',
      uz: "Qo'lni band qiling",
    },
    why: {
      ru: 'Мелкая моторика: сборка, пазлы, уборка. Ирония в том, что у вас такой работы в избытке — фасовка и есть занятие рук.',
      uz: "Mayda motorika: yig'ish, pazl, yig'ishtirish. Kulgilisi shundaki, sizda bunday ish ortig'i bilan — qadoqlash qo'lni band qilishning o'zi.",
    },
    rhythm: 'principle',
    videos: ['014'],
  },
  {
    key: 'time-druzya-s-zapretom-na-temu-raboty',
    title: {
      ru: 'Друзья с запретом на тему работы',
      uz: "Ish mavzusi taqiqlangan do'stlar",
    },
    why: {
      ru: 'Пари «кто заговорил о работе — платит» названо рабочим способом.',
      uz: "«Kim ish haqida gapirsa — u to'laydi» garovi ishlaydigan usul deb atalgan.",
    },
    rhythm: 'setup',
    videos: ['014'],
  },
  {
    key: 'time-tochka-opory-na-rabote',
    title: {
      ru: 'Точка опоры на работе',
      uz: "Ishdagi tayanch nuqta",
    },
    why: {
      ru: 'Что-то знакомое и предсказуемое среди меняющегося.',
      uz: "O'zgaruvchan narsalar orasida tanish va oldindan bilinadigan bir narsa.",
    },
    rhythm: 'setup',
    videos: ['014'],
  },
  {
    key: 'time-dofaminovyy-detoks-pereotsenen',
    title: {
      ru: 'Дофаминовый детокс переоценён',
      uz: "Dofamin detoksi ortiqcha baholangan",
    },
    why: {
      ru: 'Канал прямо говорит не полагаться на него как на решение.',
      uz: "Kanal uni yechim sifatida ishonmaslikni to'g'ridan-to'g'ri aytadi.",
    },
    rhythm: 'principle',
    videos: ['014'],
  },
  {
    key: 'time-proveryat-sebya-po-stadiyam',
    title: {
      ru: 'Проверять себя по стадиям',
      uz: "O'zingizni bosqichlar bo'yicha tekshiring",
    },
    why: {
      ru: 'Выгорание — процесс со стадиями, от энтузиазма к опустошению, а не разовая усталость. Признано официально, а не выдумано.',
      uz: "Charchash — bir martalik holsizlik emas, ishtiyoqdan bo'shliqqacha bosqichlari bor jarayon. U rasman tan olingan, o'ylab topilgan emas.",
    },
    rhythm: 'quarterly',
    videos: ['045'],
  },
  {
    key: 'time-otkaz-ot-drugih-zanyatiy-trevozhnyy-priznak',
    title: {
      ru: 'Отказ от других занятий — тревожный признак',
      uz: "Boshqa mashg'ulotlardan voz kechish — xavotirli belgi",
    },
    why: {
      ru: 'Когда на всё, кроме работы, не остаётся сил — это стадия, а не характер.',
      uz: "Ishdan boshqa hamma narsaga kuch qolmasa — bu xarakter emas, bosqich.",
    },
    rhythm: 'principle',
    videos: ['045'],
  },
  {
    key: 'time-delegirovat-otkazavshis-ot-horosho-tolko-sam',
    title: {
      ru: 'Делегировать, отказавшись от «хорошо только сам»',
      uz: "«Faqat o'zim yaxshi qilaman» dan voz kechib topshiring",
    },
    why: {
      ru: '«Быстрее сделать самому» верно один раз и неверно на сотый.',
      uz: "«O'zim tezroq qilaman» bir marta to'g'ri va yuzinchisida noto'g'ri.",
    },
    rhythm: 'principle',
    videos: ['045'],
  },
  {
    key: 'time-chetkie-rabochie-chasy-i-chas-do',
    title: {
      ru: 'Чёткие рабочие часы и час до сна без работы',
      uz: "Aniq ish soatlari va uyqudan oldingi ishsiz soat",
    },
    why: {
      ru: 'Мозгу нужна граница. При работе из дома — а производство микрозелени часто дома — граница исчезает первой, и её приходится ставить искусственно.',
      uz: "Miyaga chegara kerak. Uydan ishlaganda — mikroko'kat ishlab chiqarish ko'pincha uyda — chegara birinchi bo'lib yo'qoladi, va uni sun'iy qo'yishga to'g'ri keladi.",
    },
    rhythm: 'daily',
    videos: ['045'],
  },
  {
    key: 'time-vossozdat-usloviya-v-kotoryh-bylo-horosho',
    title: {
      ru: 'Воссоздать условия, в которых было хорошо',
      uz: "Yaxshi bo'lgan sharoitni qayta tiklang",
    },
    why: {
      ru: 'Вспомнить, что восстанавливало раньше, и повторить — вместо поиска нового способа.',
      uz: "Ilgari nima tiklaganini eslab, takrorlang — yangi usul izlash o'rniga.",
    },
    rhythm: 'principle',
    videos: ['045'],
  },
  {
    key: 'time-otdyh-bez-telefona',
    title: {
      ru: 'Отдых без телефона',
      uz: "Telefonsiz dam",
    },
    why: {
      ru: 'Иначе это не отдых. Лента и рабочие сообщения не дают вниманию переключиться, и час с телефоном восстанавливает хуже, чем двадцать минут без него.',
      uz: "Aks holda bu dam emas. Lenta va ish xabarlari diqqatga o'tishga imkon bermaydi, va telefon bilan bir soat undan yigirma daqiqa telefonsizdan yomonroq tiklaydi.",
    },
    rhythm: 'daily',
    videos: ['045'],
  },
  {
    key: 'time-sport-kak-nagruzka-vyshe-privychnoy',
    title: {
      ru: 'Спорт как нагрузка выше привычной',
      uz: "Sport — odatdagidan yuqori yuk sifatida",
    },
    why: {
      ru: 'Физическая активность влияет на состояние заметнее разговоров с собой.',
      uz: "Jismoniy faollik holatga o'zi bilan suhbatdan sezilarliroq ta'sir qiladi.",
    },
    rhythm: 'weekly',
    videos: ['045', '108'],
  },
  {
    key: 'time-osoznanno-snizhat-planku',
    title: {
      ru: 'Осознанно снижать планку',
      uz: "Ongli ravishda planni pasaytiring",
    },
    why: {
      ru: 'Сделанное неидеально лучше несделанного. Правило «забей» — про сознательный выбор, а не про безразличие.',
      uz: "Mukammal qilinmagani qilinmaganidan yaxshi. «Qo'yaver» qoidasi — befarqlik emas, ongli tanlov haqida.",
    },
    rhythm: 'principle',
    videos: ['045'],
  },
  {
    key: 'time-radikalnye-varianty-i-spetsialist',
    title: {
      ru: 'Радикальные варианты и специалист',
      uz: "Keskin variantlar va mutaxassis",
    },
    why: {
      ru: 'Пауза или смена направления — допустимый ход. Если сил нет ни на что — к специалисту.',
      uz: "Pauza yoki yo'nalishni o'zgartirish — joiz qadam. Agar hech nimaga kuch qolmasa — mutaxassisga.",
    },
    rhythm: 'principle',
    videos: ['045'],
  },
  {
    key: 'time-razlichat-strah-i-stress',
    title: {
      ru: 'Различать страх и стресс',
      uz: "Qo'rquv bilan stressni farqlang",
    },
    why: {
      ru: 'Быстрая реакция на угрозу — не то же, что длительное напряжение.',
      uz: "Tahdidga tez javob — uzoq davom etadigan taranglik bilan bir xil emas.",
    },
    rhythm: 'principle',
    videos: ['012'],
  },
  {
    key: 'time-eustress-i-distress',
    title: {
      ru: 'Эустресс и дистресс',
      uz: "Eustress va distress",
    },
    why: {
      ru: 'Умеренный завершающийся стресс развивает; непрекращающийся разрушает. Критерий — завершённость: стресс, у которого нет конца, вреден.',
      uz: "Me'yordagi, tugaydigan stress rivojlantiradi; to'xtamaydigani buzadi. Mezon — tugallanganlik: oxiri yo'q stress zararli.",
    },
    rhythm: 'principle',
    videos: ['012'],
  },
  {
    key: 'time-bank-uverennosti-i-yakor-kontrolya',
    title: {
      ru: 'Банк уверенности и якорь контроля',
      uz: "Ishonch banki va nazorat langari",
    },
    why: {
      ru: 'Записи о случаях, когда справились, и хотя бы одна область, где всё под контролем: режим сна, тренировки, порядок в мастерской.',
      uz: "Uddalagan holatlaringiz haqidagi yozuvlar va hech bo'lmasa bitta hammasi nazoratda bo'lgan soha: uyqu tartibi, mashg'ulotlar, ustaxonadagi tartib.",
    },
    rhythm: 'principle',
    videos: ['012'],
  },
  {
    key: 'time-priem-smeny-perspektivy',
    title: {
      ru: 'Приём смены перспективы',
      uz: "Nuqtai nazarni almashtirish usuli",
    },
    why: {
      ru: 'Взгляд на ситуацию из будущего снижает её вес.',
      uz: "Vaziyatga kelajakdan qarash uning og'irligini kamaytiradi.",
    },
    rhythm: 'principle',
    videos: ['012'],
  },
  {
    key: 'time-nachat-delat-esli-stress-ot-nedelaniya',
    title: {
      ru: 'Начать делать, если стресс от неделания',
      uz: "Qilmaslikdan stress bo'lsa — qila boshlang",
    },
    why: {
      ru: 'Часть тревоги снимается не отдыхом, а первым шагом: она и была про несделанное.',
      uz: "Xavotirning bir qismi dam bilan emas, birinchi qadam bilan olinadi: u qilinmagani haqida edi.",
    },
    rhythm: 'principle',
    videos: ['012'],
  },
  {
    key: 'time-razdelyat-podvlastnoe-i-nepodvlastnoe',
    title: {
      ru: 'Разделять подвластное и неподвластное',
      uz: "Qo'lingizdagini qo'lingizda bo'lmaganidan ajrating",
    },
    why: {
      ru: 'Сосредоточиться на том, что в вашей власти. Стоический принцип, к которому канал возвращается в кризисном выпуске.',
      uz: "Sizning qo'lingizdagiga e'tibor qarating. Kanal inqiroz sonida qaytadigan stoik tamoyil.",
    },
    rhythm: 'principle',
    videos: ['012'],
  },
  {
    key: 'time-sotsialnaya-podderzhka',
    title: {
      ru: 'Социальная поддержка',
      uz: "Ijtimoiy qo'llab-quvvatlash",
    },
    why: {
      ru: 'Не изолироваться и общаться с теми, кто в похожем положении. Другие мелкие производители — не только конкуренты: обмен опытом по семенам, поставщикам и заведениям стоит ноль и снимает ощущение, что проблемы уникальны.',
      uz: "Yakkalanmang va shunga o'xshash ahvoldagilar bilan muloqot qiling. Boshqa mayda ishlab chiqaruvchilar — faqat raqobatchi emas: urug', yetkazib beruvchi va muassasalar bo'yicha tajriba almashish nolga tushadi va muammolar noyob degan tuyg'uni olib tashlaydi.",
    },
    rhythm: 'principle',
    videos: ['012', '108'],
  },
  {
    key: 'time-snachala-sobstvennik-potom-biznes',
    title: {
      ru: 'Сначала собственник, потом бизнес',
      uz: "Avval egasi, keyin biznes",
    },
    why: {
      ru: 'Решения в панике бесполезны. И неопределённость — норма, а не временное отклонение.',
      uz: "Vahimadagi qarorlar foydasiz. Va noaniqlik — vaqtinchalik og'ish emas, me'yor.",
    },
    rhythm: 'principle',
    videos: ['108'],
  },
  {
    key: 'time-ne-prikazyvat-sebe-uspokoitsya',
    title: {
      ru: 'Не приказывать себе успокоиться',
      uz: "O'zingizga tinchlanishni buyurmang",
    },
    why: {
      ru: 'Не работает и усиливает тревогу. Работают рутинные контролируемые действия — а в микрозелени они встроены в работу: утренний обход даёт результат независимо от того, что происходит со сбытом.',
      uz: "Ishlamaydi va xavotirni kuchaytiradi. Nazorat qilinadigan odatiy harakatlar ishlaydi — mikroko'katda esa ular ishga o'rnatilgan: ertalabki aylanma sotuvda nima bo'layotganidan qat'i nazar natija beradi.",
    },
    rhythm: 'principle',
    videos: ['108'],
  },
  {
    key: 'time-sokratit-gorizont-planirovaniya',
    title: {
      ru: 'Сократить горизонт планирования',
      uz: "Rejalashtirish ufqini qisqartiring",
    },
    why: {
      ru: 'В нестабильный период планировать на длину одного цикла — неделю-полторы.',
      uz: "Beqaror davrda bitta sikl uzunligiga — bir hafta-o'n kunga rejalashtiring.",
    },
    rhythm: 'principle',
    videos: ['108'],
  },
  {
    key: 'time-vydelennoe-vremya-na-sryv',
    title: {
      ru: 'Выделенное время на срыв',
      uz: "Buzilishga ajratilgan vaqt",
    },
    why: {
      ru: 'Запланированная разрядка вместо подавления.',
      uz: "Bostirish o'rniga rejalashtirilgan bo'shashish.",
    },
    rhythm: 'principle',
    videos: ['108'],
  },
  {
    key: 'time-spisok-togo-chto-raduet',
    title: {
      ru: 'Список того, что радует',
      uz: "Quvontiradigan narsalar ro'yxati",
    },
    why: {
      ru: 'С заменой недоступного доступным.',
      uz: "Mavjud bo'lmaganini mavjudi bilan almashtirib.",
    },
    rhythm: 'setup',
    videos: ['108'],
  },
];
