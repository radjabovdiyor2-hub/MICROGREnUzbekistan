import type { Practice } from './practices';

// Практики области «Команда и делегирование».
//
// Содержимое, а не логика: вытащено из разбора канала, где за каждой
// строкой стоит несколько советов. Ритм — предположение, и владелец
// меняет его на экране: своя неделя виднее отсюда.

export const TEAM_PRACTICES: Practice[] = [
  {
    key: 'team-kriteriy-samozanyatosti',
    title: {
      ru: 'Критерий самозанятости',
      uz: "O'z-o'zini bandlik mezoni",
    },
    why: {
      ru: 'Если деньги приходят только когда вы лично работаете — это самозанятость. Микрозелень попадает под определение буквально: растения требуют внимания каждый день и не ждут.',
      uz: "Agar pul faqat siz shaxsan ishlaganingizda kelsa — bu o'z-o'zini bandlik. Mikroko'kat ta'rifga so'zma-so'z tushadi: o'simliklar har kuni e'tibor talab qiladi va kutmaydi.",
    },
    rhythm: 'quarterly',
    videos: ['104'],
  },
  {
    key: 'team-smenit-vopros',
    title: {
      ru: 'Сменить вопрос',
      uz: "Savolni almashtiring",
    },
    why: {
      ru: 'Вместо «как я это сделаю» — «кто сделает это вместо меня». Канал называет это главным переходом.',
      uz: "«Buni qanday qilaman» o'rniga — «buni kim men o'rnimga qiladi». Kanal buni asosiy o'tish deb ataydi.",
    },
    rhythm: 'principle',
    videos: ['104'],
  },
  {
    key: 'team-tsena-bezdeystviya',
    title: {
      ru: 'Цена бездействия',
      uz: "Harakatsizlik narxi",
    },
    why: {
      ru: 'Главный довод не про удобство: пока рутина съедает время владельца, он не занимается стратегией и продуктом.',
      uz: "Asosiy dalil qulaylik haqida emas: kundalik ish egasining vaqtini yeb turar ekan, u strategiya va mahsulot bilan shug'ullanmaydi.",
    },
    rhythm: 'principle',
    videos: ['105'],
  },
  {
    key: 'team-arifmetika-masshtaba',
    title: {
      ru: 'Арифметика масштаба',
      uz: "Miqyos arifmetikasi",
    },
    why: {
      ru: 'Вы сделаете вдвое больше помощника, но не в сотни раз больше. Личная производительность упирается в потолок раньше, чем спрос.',
      uz: "Siz yordamchidan ikki barobar ko'p qilasiz, lekin yuz barobar emas. Shaxsiy unumdorlik talabdan oldinroq shiftga uriladi.",
    },
    rhythm: 'principle',
    videos: ['105'],
  },
  {
    key: 'team-prinyat-prosadku-dohoda',
    title: {
      ru: 'Принять просадку дохода',
      uz: "Daromad pasayishini qabul qiling",
    },
    why: {
      ru: 'Наём окупается не сразу — это нормальная часть перехода, а не признак ошибки.',
      uz: "Yollash darrov o'zini oqlamaydi — bu o'tishning odatiy qismi, xato belgisi emas.",
    },
    rhythm: 'principle',
    videos: ['104'],
  },
  {
    key: 'team-nanimat-togo-bez-kogo-ne-vyrastete',
    title: {
      ru: 'Нанимать того, без кого не вырастете',
      uz: "Usiz o'smaydiganingizni yollang",
    },
    why: {
      ru: 'В микрозелени это почти всегда человек на монотонные операции — промывка, посев, фасовка. Он высвобождает ваши часы на продажи, а продажи ограничивают рост.',
      uz: "Mikroko'katda bu deyarli har doim bir xil operatsiyalardagi odam — yuvish, ekish, qadoqlash. U sizning soatlaringizni sotuvga bo'shatadi, sotuv esa o'sishni cheklaydi.",
    },
    rhythm: 'principle',
    videos: ['103'],
  },
  {
    key: 'team-ne-razduvat-shtat-no-i-ne',
    title: {
      ru: 'Не раздувать штат, но и не экономить на ключевых',
      uz: "Shtatni shishirmang, lekin kalit odamlarda tejamang",
    },
    why: {
      ru: 'Недоплата оборачивается вашей работой за двоих. Опытный дороже, но делает сам.',
      uz: "Kam to'lash sizning ikki kishilik ishingizga aylanadi. Tajribalisi qimmat, lekin o'zi qiladi.",
    },
    rhythm: 'principle',
    videos: ['103'],
  },
  {
    key: 'team-ostorozhno-s-blizkimi',
    title: {
      ru: 'Осторожно с близкими',
      uz: "Yaqinlar bilan ehtiyot bo'ling",
    },
    why: {
      ru: 'В микробизнесе первый помощник часто оказывается родственником. Проблема известна: требовать неудобно, а расстаться почти невозможно.',
      uz: "Mikrobiznesda birinchi yordamchi ko'pincha qarindosh bo'lib chiqadi. Muammo ma'lum: talab qilish noqulay, ajralish esa deyarli imkonsiz.",
    },
    rhythm: 'principle',
    videos: ['103'],
  },
  {
    key: 'team-opisat-vakansiyu-podrobno-i-v-svoem',
    title: {
      ru: 'Описать вакансию подробно и в своём стиле',
      uz: "Vakansiyani batafsil va o'z uslubingizda yozing",
    },
    why: {
      ru: 'Убрать очевидные требования, оставить уникальные компетенции. Для вас уникальное — аккуратность и обязательность в ежедневном цикле, а не опыт в сельском хозяйстве.',
      uz: "Ravshan talablarni olib tashlang, noyob malakalarni qoldiring. Siz uchun noyobi — qishloq xo'jaligidagi tajriba emas, kundalik sikldagi aniqlik va mas'uliyat.",
    },
    rhythm: 'principle',
    videos: ['103'],
  },
  {
    key: 'team-ogranichit-chislo-sobesedovaniy-i-reshit-chto',
    title: {
      ru: 'Ограничить число собеседований и решить, что важнее',
      uz: "Suhbatlar sonini cheklang va nima muhimroq ekanini hal qiling",
    },
    why: {
      ru: 'Профессионализм или совместимость — сочетание встречается редко и стоит дорого. Для ежедневной работы бок о бок совместимость весит больше обычного.',
      uz: "Kasbiylikmi yoki moslikmi — ularning birikmasi kam uchraydi va qimmat turadi. Yonma-yon kundalik ish uchun moslik odatdagidan ko'proq og'irlik qiladi.",
    },
    rhythm: 'principle',
    videos: ['103'],
  },
  {
    key: 'team-testovoe-zadanie-iz-realnoy-raboty',
    title: {
      ru: 'Тестовое задание из реальной работы',
      uz: "Sinov topshirig'i haqiqiy ishdan",
    },
    why: {
      ru: 'Для вас оно буквально: дать провести один цикл — посеять лоток, поливать по режиму, срезать, расфасовать.',
      uz: "Siz uchun u so'zma-so'z: bitta siklni o'tkazishga ruxsat bering — lotok eking, rejim bo'yicha sug'oring, kesing, qadoqlang.",
    },
    rhythm: 'principle',
    videos: ['103'],
  },
  {
    key: 'team-ispytatelnyy-srok-i-forma-oformleniya',
    title: {
      ru: 'Испытательный срок и форма оформления',
      uz: "Sinov muddati va rasmiylashtirish shakli",
    },
    why: {
      ru: 'Испытательный срок оставляет возможность исправить ошибку найма. Формы оформления — срочный договор, сезонная работа — при вашей сезонности особенно уместны: они позволяют не держать человека в межсезонье.',
      uz: "Sinov muddati yollashdagi xatoni tuzatish imkonini qoldiradi. Rasmiylashtirish shakllari — muddatli shartnoma, mavsumiy ish — sizning mavsumiyligingizda ayniqsa o'rinli: ular odamni mavsumlararo ushlab turmaslikka imkon beradi.",
    },
    rhythm: 'principle',
    videos: ['082', '103'],
  },
  {
    key: 'team-sistema-nayma-i-obucheniya',
    title: {
      ru: 'Система найма и обучения',
      uz: "Yollash va o'qitish tizimi",
    },
    why: {
      ru: 'Когда людей станет больше: подбор силами руководителей направлений, обучение с закреплённым ответственным.',
      uz: "Odamlar ko'payganda: yo'nalish rahbarlari kuchi bilan tanlov, mas'uli biriktirilgan o'qitish.",
    },
    rhythm: 'principle',
    videos: ['105'],
  },
  {
    key: 'team-nanyat-lyudey-i-sozdat-komandu-raznoe',
    title: {
      ru: 'Нанять людей и создать команду — разное',
      uz: "Odam yollash va jamoa yaratish — har xil",
    },
    why: {
      ru: 'Ждать результата сразу после найма рано.',
      uz: "Yollashdan darrov keyin natija kutish erta.",
    },
    rhythm: 'principle',
    videos: ['103'],
  },
  {
    key: 'team-prozrachnaya-orgstruktura-i-plany',
    title: {
      ru: 'Прозрачная оргструктура и планы',
      uz: "Shaffof tuzilma va rejalar",
    },
    why: {
      ru: 'Оргструктура, планы и порядок принятия решений должны быть понятны команде.',
      uz: "Tashkiliy tuzilma, rejalar va qaror qabul qilish tartibi jamoaga tushunarli bo'lishi kerak.",
    },
    rhythm: 'setup',
    videos: ['105'],
  },
  {
    key: 'team-vytaskivat-sebya-iz-klyuchevyh-roley',
    title: {
      ru: 'Вытаскивать себя из ключевых ролей',
      uz: "O'zingizni kalit rollardan chiqaring",
    },
    why: {
      ru: 'Качество временно упадёт — помощник будет срезать медленнее и промывать хуже. Возврат к самостоятельному выполнению после первого же брака гарантирует, что вы останетесь единственным исполнителем навсегда.',
      uz: "Sifat vaqtincha pasayadi — yordamchi sekinroq kesadi va yomonroq yuvadi. Birinchi brakdan keyin o'zingiz bajarishga qaytish sizni abadiy yagona ijrochi bo'lib qolishingizni kafolatlaydi.",
    },
    rhythm: 'principle',
    videos: ['104'],
  },
  {
    key: 'team-uhodya-uhodi',
    title: {
      ru: 'Уходя — уходи',
      uz: "Ketsang — ket",
    },
    why: {
      ru: 'Наняв руководителя, не подруливать ему. Постоянные указания портят отношения и обнуляют смысл найма.',
      uz: "Rahbar yollab, unga aralashib turmang. Doimiy ko'rsatmalar munosabatni buzadi va yollashning ma'nosini nolga chiqaradi.",
    },
    rhythm: 'principle',
    videos: ['105'],
  },
  {
    key: 'team-ne-soglashatsya-na-kompromiss-pri-vybore',
    title: {
      ru: 'Не соглашаться на компромисс при выборе управляющего',
      uz: "Boshqaruvchi tanlashda murosaga bormang",
    },
    why: {
      ru: 'Месяцы поиска — нормальный срок для этой позиции. Два критерия: опыт в вашей специфике и способность строить процесс, а не только продавать самому.',
      uz: "Oylab izlash — bu lavozim uchun odatiy muddat. Ikki mezon: sizning sohangizdagi tajriba va o'zi sotishdan tashqari jarayon qura olish.",
    },
    rhythm: 'principle',
    videos: ['061', '105'],
  },
  {
    key: 'team-ne-otdavat-upravlenie-tselikom',
    title: {
      ru: 'Не отдавать управление целиком',
      uz: "Boshqaruvni butunlay bermang",
    },
    why: {
      ru: 'Выходя из операционки, нельзя выпасть из контроля полностью. Показатели остаются у вас.',
      uz: "Operatsion ishdan chiqayotib, nazoratdan butunlay tushib qolish mumkin emas. Ko'rsatkichlar sizda qoladi.",
    },
    rhythm: 'principle',
    videos: ['061'],
  },
  {
    key: 'team-pridumat-sebe-novoe-zanyatie',
    title: {
      ru: 'Придумать себе новое занятие',
      uz: "O'zingizga yangi mashg'ulot o'ylab toping",
    },
    why: {
      ru: 'Без нового дела вы вернётесь в операционку через неделю. Для вас освободившееся время имеет смысл только если уходит на сбыт и новые направления — иначе вы наняли человека ради свободных вечеров и потеряли деньги без роста выручки.',
      uz: "Yangi ishsiz siz bir haftada operatsion ishga qaytasiz. Siz uchun bo'shagan vaqt faqat sotuv va yangi yo'nalishlarga ketsa ma'noga ega — aks holda siz bo'sh kechalar uchun odam yollab, tushumni oshirmay pul yo'qotgan bo'lasiz.",
    },
    rhythm: 'principle',
    videos: ['105'],
  },
  {
    key: 'team-osvobodivsheesya-vremya-na-sistemnyy-sbyt',
    title: {
      ru: 'Освободившееся время — на системный сбыт',
      uz: "Bo'shagan vaqt — tizimli sotuvga",
    },
    why: {
      ru: 'Финал выпуска про делегирование смыкается со сбытом: смысл высвобожденных часов — настроить предсказуемый поток клиентов, а не полагаться на рекомендации.',
      uz: "Topshiriq haqidagi sonning yakuni sotuv bilan tutashadi: bo'shagan soatlarning ma'nosi — tavsiyalarga tayanmay, oldindan bilinadigan mijoz oqimini sozlash.",
    },
    rhythm: 'principle',
    videos: ['104'],
  },
  {
    key: 'team-predprinimatel-i-upravlenets-raznye-roli',
    title: {
      ru: 'Предприниматель и управленец — разные роли',
      uz: "Tadbirkor va boshqaruvchi — har xil rollar",
    },
    why: {
      ru: 'Один создаёт то, чего не было, другой планомерно улучшает работающее. Если вам интереснее запускать — операционку надо отдавать; если отлаживать — помощник нужен на разъезды и продажи.',
      uz: "Biri bo'lmagan narsani yaratadi, ikkinchisi ishlayotganini bosqichma-bosqich yaxshilaydi. Sizga ishga tushirish qiziqroq bo'lsa — operatsion ishni berish kerak; sozlash qiziq bo'lsa — yordamchi safar va sotuvga kerak.",
    },
    rhythm: 'principle',
    videos: ['105'],
  },
  {
    key: 'team-ne-byt-drugom-dlya-vseh',
    title: {
      ru: 'Не быть другом для всех',
      uz: "Hammaga do'st bo'lmang",
    },
    why: {
      ru: 'Страх требовать — ошибка мягкого руководителя.',
      uz: "Talab qilishdan qo'rqish — yumshoq rahbarning xatosi.",
    },
    rhythm: 'principle',
    videos: ['078'],
  },
  {
    key: 'team-derzhat-slovo-v-obe-storony',
    title: {
      ru: 'Держать слово в обе стороны',
      uz: "So'zda turing — ikki tomonga ham",
    },
    why: {
      ru: 'Невыполненное обещание руководителя обесценивает все следующие.',
      uz: "Rahbarning bajarilmagan va'dasi keyingi hammasini qadrsizlantiradi.",
    },
    rhythm: 'principle',
    videos: ['078'],
  },
  {
    key: 'team-balans-pooschreniya-i-vzyskaniya-bez-totalnogo',
    title: {
      ru: 'Баланс поощрения и взыскания, без тотального контроля',
      uz: "Rag'bat va jazo muvozanati, total nazoratsiz",
    },
    why: {
      ru: 'Тотальный контроль убивает инициативу и даёт пассивность.',
      uz: "Total nazorat tashabbusni o'ldiradi va passivlik beradi.",
    },
    rhythm: 'principle',
    videos: ['078'],
  },
  {
    key: 'team-sledit-prinosyat-li-plohie-novosti',
    title: {
      ru: 'Следить, приносят ли плохие новости',
      uz: "Yomon xabarlarni olib kelishadimi — kuzating",
    },
    why: {
      ru: 'Если о проблемах узнаёте последним — люди боятся их приносить. Отчётность стоит проверять независимо: красивые цифры бывают следствием страха, а не результата.',
      uz: "Muammolar haqida oxirgi bo'lib bilsangiz — odamlar ularni olib kelishdan qo'rqadi. Hisobotni mustaqil tekshirgan ma'qul: chiroyli raqamlar natijaning emas, qo'rquvning oqibati bo'lishi mumkin.",
    },
    rhythm: 'weekly',
    videos: ['078'],
  },
  {
    key: 'team-priznavat-svoi-oshibki-otkryto',
    title: {
      ru: 'Признавать свои ошибки открыто',
      uz: "Xatolaringizni ochiq tan oling",
    },
    why: {
      ru: 'Повышает доверие, а не снижает авторитет.',
      uz: "Bu ishonchni oshiradi, obro'ni tushirmaydi.",
    },
    rhythm: 'principle',
    videos: ['078'],
  },
  {
    key: 'team-raznyy-podhod-k-raznym-lyudyam',
    title: {
      ru: 'Разный подход к разным людям',
      uz: "Turli odamga turlicha yondashuv",
    },
    why: {
      ru: 'Пять качеств лидера и дифференцированный подход: одним нужна свобода, другим — чёткие рамки.',
      uz: "Rahbarning besh sifati va tabaqalashtirilgan yondashuv: birlariga erkinlik, boshqalariga aniq chegara kerak.",
    },
    rhythm: 'principle',
    videos: ['078'],
  },
  {
    key: 'team-sledit-za-sobstvennoy-energiey',
    title: {
      ru: 'Следить за собственной энергией',
      uz: "O'z quvvatingizni kuzating",
    },
    why: {
      ru: 'Состояние руководителя передаётся команде, и восстанавливаться надо вне работы.',
      uz: "Rahbarning holati jamoaga o'tadi, tiklanish esa ishdan tashqarida bo'lishi kerak.",
    },
    rhythm: 'monthly',
    videos: ['078'],
  },
  {
    key: 'team-razvivat-znaniya-i-produmyvat-varianty-buduschego',
    title: {
      ru: 'Развивать знания и продумывать варианты будущего',
      uz: "Bilimni o'stiring va kelajak variantlarini o'ylab qo'ying",
    },
    why: {
      ru: 'Руководитель, переставший учиться, ограничивает потолок команды своим.',
      uz: "O'rganishni to'xtatgan rahbar jamoaning shiftini o'zinikiga cheklaydi.",
    },
    rhythm: 'principle',
    videos: ['078'],
  },
  {
    key: 'team-roli-po-silnym-storonam-interesnye-zadachi',
    title: {
      ru: 'Роли по сильным сторонам, интересные задачи, инициатива',
      uz: "Rollar kuchli tomonlar bo'yicha, qiziq vazifalar, tashabbus",
    },
    why: {
      ru: 'Три совета про удержание, которые на вашем масштабе стоят дёшево и работают сразу: - Распределять роли по сильным сторонам и следить, чтобы человек не был ни перегружен, ни без дела.',
      uz: "Ushlab qolish haqidagi uchta maslahat, ular sizning miqyosingizda arzon turadi va darrov ishlaydi: rollarni kuchli tomonlar bo'yicha taqsimlash va odam na ortiqcha yuklangan, na ishsiz qolmaganini kuzatish.",
    },
    rhythm: 'principle',
    videos: ['103'],
  },
  {
    key: 'team-rol-mediatora-v-konflikte',
    title: {
      ru: 'Роль медиатора в конфликте',
      uz: "Nizoda vositachi roli",
    },
    why: {
      ru: 'Выслушать все стороны и принять решение самому, не принимая ничью сторону заранее. Та же схема, что в разделе G.',
      uz: "Barcha tomonni tinglang va qarorni o'zingiz qabul qiling, oldindan hech kimning tarafini olmay. G bo'limidagi bilan bir xil sxema.",
    },
    rhythm: 'principle',
    videos: ['056'],
  },
  {
    key: 'team-ne-vydavat-sotrudnika-klientu-srazu',
    title: {
      ru: 'Не выдавать сотрудника клиенту сразу',
      uz: "Xodimni mijozga darrov berib qo'ymang",
    },
    why: {
      ru: 'Сначала успокоить клиента, разобраться потом. Публичный разнос при клиенте разрушает и команду, и доверие.',
      uz: "Avval mijozni tinchlantiring, keyin tushunib oling. Mijoz oldida ochiq tanbeh jamoani ham, ishonchni ham buzadi.",
    },
    rhythm: 'principle',
    videos: ['056'],
  },
  {
    key: 'team-derzhat-v-ravnovesii-interesy-klienta-i',
    title: {
      ru: 'Держать в равновесии интересы клиента и команды',
      uz: "Mijoz va jamoa manfaatini muvozanatda tuting",
    },
    why: {
      ru: 'Всегда правый клиент разрушает команду; всегда правая команда теряет клиента.',
      uz: "Har doim haq mijoz jamoani buzadi; har doim haq jamoa mijozni yo'qotadi.",
    },
    rhythm: 'principle',
    videos: ['056'],
  },
  {
    key: 'team-ne-kopirovat-chuzhoy-stil',
    title: {
      ru: 'Не копировать чужой стиль',
      uz: "Begona uslubni nusxalamang",
    },
    why: {
      ru: 'Притворство считывается. Опора на свою личность работает лучше заимствованной манеры.',
      uz: "Soxtalik sezilib qoladi. O'z shaxsiyatingizga tayanish o'zlashtirilgan uslubdan yaxshiroq ishlaydi.",
    },
    rhythm: 'principle',
    videos: ['056'],
  },
  {
    key: 'team-stroit-komandu-kotoraya-rabotaet-bez-vas',
    title: {
      ru: 'Строить команду, которая работает без вас',
      uz: "Sizsiz ishlaydigan jamoa quring",
    },
    why: {
      ru: 'Культура вместо культа личности — то же, к чему ведёт №105.',
      uz: "Shaxs kulti o'rniga madaniyat — 105-son ham shunga olib boradi.",
    },
    rhythm: 'principle',
    videos: ['056'],
  },
  {
    key: 'team-sobirat-po-silnym-storonam-i-kalibrovat',
    title: {
      ru: 'Собирать по сильным сторонам и калибровать цели',
      uz: "Kuchli tomonlar bo'yicha yig'ing va maqsadni kalibrlang",
    },
    why: {
      ru: 'Слишком амбициозная цель демотивирует так же, как слишком лёгкая.',
      uz: "Haddan tashqari shijoatkor maqsad juda yengilidek demotivatsiya qiladi.",
    },
    rhythm: 'principle',
    videos: ['056'],
  },
  {
    key: 'team-smotret-dalshe-tekuschih-zadach',
    title: {
      ru: 'Смотреть дальше текущих задач',
      uz: "Joriy vazifalardan uzoqroqqa qarang",
    },
    why: {
      ru: 'Различение руководителя и лидера: первый налаживает настоящее, второй ведёт в будущее.',
      uz: "Rahbar bilan liderning farqi: birinchisi bugungini yo'lga qo'yadi, ikkinchisi kelajakka boshlaydi.",
    },
    rhythm: 'principle',
    videos: ['056'],
  },
  {
    key: 'team-hvalit-i-blagodarit',
    title: {
      ru: 'Хвалить и благодарить',
      uz: "Maqtang va rahmat ayting",
    },
    why: {
      ru: 'Канал выносит это в отдельный принцип — значит, забывают чаще всего.',
      uz: "Kanal buni alohida tamoyilga chiqaradi — demak, ko'pincha unutiladi.",
    },
    rhythm: 'weekly',
    videos: ['056'],
  },
  {
    key: 'team-ne-zhdat-chto-rassosetsya-i-vmeshivatsya',
    title: {
      ru: 'Не ждать, что рассосётся, и вмешиваться рано',
      uz: "O'z-o'zidan hal bo'lishini kutmang, erta aralashing",
    },
    why: {
      ru: 'Терпение здесь не добродетель: последствия — падение качества, потеря темпа, уход людей.',
      uz: "Sabr bu yerda fazilat emas: oqibatlari — sifat pasayishi, sur'at yo'qolishi, odamlarning ketishi.",
    },
    rhythm: 'principle',
    videos: ['080'],
  },
  {
    key: 'team-snachala-snizit-nakal-potom-razbirat-sut',
    title: {
      ru: 'Сначала снизить накал, потом разбирать суть',
      uz: "Avval qizg'inlikni pasaytiring, keyin mohiyatni ko'ring",
    },
    why: {
      ru: 'Дать высказаться всем, держать позицию беспристрастного посредника. Та же схема, что в №056.',
      uz: "Hammaga gapirishga imkon bering, xolis vositachi pozitsiyasini tuting. 056-sondagi bilan bir xil sxema.",
    },
    rhythm: 'principle',
    videos: ['080'],
  },
  {
    key: 'team-razvesti-zony-otvetstvennosti',
    title: {
      ru: 'Развести зоны ответственности',
      uz: "Javobgarlik zonalarini ajrating",
    },
    why: {
      ru: 'Размытая ответственность названа первой причиной конфликтов. Профилактика дешевле разбора.',
      uz: "Aniq bo'lmagan javobgarlik nizolarning birinchi sababi deb atalgan. Profilaktika tahlildan arzonroq.",
    },
    rhythm: 'principle',
    videos: ['080'],
  },
  {
    key: 'team-obschaya-tsel-konkretno-a-ne-abstraktno',
    title: {
      ru: 'Общая цель конкретно, а не абстрактно',
      uz: "Umumiy maqsad mavhum emas, aniq bo'lsin",
    },
    why: {
      ru: '«Работать хорошо» — не цель. Цель — число и срок, по которым видно, дошли или нет.',
      uz: "«Yaxshi ishlash» — maqsad emas. Maqsad — yetdikmi yoki yo'qmi ko'rinadigan raqam va muddat.",
    },
    rhythm: 'principle',
    videos: ['080'],
  },
  {
    key: 'team-bystro-vyyavlyat-nevypolnyayuschih-obyazatelstva',
    title: {
      ru: 'Быстро выявлять невыполняющих обязательства',
      uz: "Majburiyatni bajarmayotganlarni tez aniqlang",
    },
    why: {
      ru: 'Невыполненное обещание, оставленное без разбора, за месяц становится нормой для всех остальных.',
      uz: "Tahlilsiz qoldirilgan bajarilmagan va'da bir oyda qolganlarning hammasi uchun me'yorga aylanadi.",
    },
    rhythm: 'principle',
    videos: ['080'],
  },
  {
    key: 'team-obratnaya-svyaz-v-obe-storony-i',
    title: {
      ru: 'Обратная связь в обе стороны и правило «критикуешь — предлагай»',
      uz: "Ikki tomonlama teskari aloqa va «tanqid qilsang — taklif qil» qoidasi",
    },
    why: {
      ru: 'Ограничивает пустую критику и превращает жалобу в предложение.',
      uz: "Bo'sh tanqidni cheklaydi va shikoyatni taklifga aylantiradi.",
    },
    rhythm: 'principle',
    videos: ['080'],
  },
  {
    key: 'team-otbirat-komandnyh-igrokov',
    title: {
      ru: 'Отбирать командных игроков',
      uz: "Jamoaviy o'yinchilarni tanlang",
    },
    why: {
      ru: 'Совместимость важнее максимальной силы по отдельности.',
      uz: "Moslik alohida olingan maksimal kuchdan muhimroq.",
    },
    rhythm: 'principle',
    videos: ['080'],
  },
  {
    key: 'team-mysl-ob-uvolnenii-uzhe-signal',
    title: {
      ru: 'Мысль об увольнении — уже сигнал',
      uz: "Ishdan bo'shatish fikri — o'zi signal",
    },
    why: {
      ru: 'Если сомневаетесь — значит, сотрудник не так уж хорош.',
      uz: "Shubhalanayotgan bo'lsangiz — demak, xodim unchalik ham yaxshi emas.",
    },
    rhythm: 'principle',
    videos: ['082'],
  },
  {
    key: 'team-ne-tyanut-iz-chuvstva-viny',
    title: {
      ru: 'Не тянуть из чувства вины',
      uz: "Aybdorlik hissidan tortib yurmang",
    },
    why: {
      ru: 'Безответственность заразна, а скорость команды равна скорости самого медленного. Три признака для расставания: безразличие, невыполнение, разрушение атмосферы.',
      uz: "Mas'uliyatsizlik yuqumli, jamoaning tezligi esa eng sekinining tezligiga teng. Ajralish uchun uch belgi: befarqlik, bajarmaslik, muhitni buzish.",
    },
    rhythm: 'principle',
    videos: ['082'],
  },
  {
    key: 'team-kak-provodit-razgovor',
    title: {
      ru: 'Как проводить разговор',
      uz: "Suhbatni qanday o'tkazish",
    },
    why: {
      ru: 'Лично и один на один, фактами и без оправданий, спокойно при любой реакции. Доказательства собрать заранее — отчёты, зафиксированные нарушения.',
      uz: "Shaxsan va yakkama-yakka, faktlar bilan va oqlanmasdan, har qanday javobda xotirjam. Dalillarni oldindan yig'ing — hisobotlar, qayd etilgan buzilishlar.",
    },
    rhythm: 'principle',
    videos: ['082'],
  },
  {
    key: 'team-prinyat-chto-vinovatym-ostanetes-vy',
    title: {
      ru: 'Принять, что виноватым останетесь вы',
      uz: "Aybdor siz bo'lib qolishingizni qabul qiling",
    },
    why: {
      ru: 'При расставании правым в глазах уходящего вы не будете. Это цена решения, а не признак ошибки.',
      uz: "Ajralishda ketayotgan odamning ko'zida siz haq bo'lmaysiz. Bu qarorning narxi, xato belgisi emas.",
    },
    rhythm: 'principle',
    videos: ['082'],
  },
  {
    key: 'team-smyagchit-esli-vozmozhno',
    title: {
      ru: 'Смягчить, если возможно',
      uz: "Iloji bo'lsa yumshating",
    },
    why: {
      ru: 'Рекомендательное письмо, время на поиск, помощь с трудоустройством. Дёшево и работает на репутацию — см.',
      uz: "Tavsiyanoma, izlashga vaqt, ishga joylashishda yordam. Arzon va obro'ga ishlaydi — qarang.",
    },
    rhythm: 'principle',
    videos: ['082'],
  },
  {
    key: 'team-obyasnit-komande-po-faktam',
    title: {
      ru: 'Объяснить команде по фактам',
      uz: "Jamoaga faktlar bilan tushuntiring",
    },
    why: {
      ru: 'Молчание порождает версии хуже правды.',
      uz: "Sukunat haqiqatdan yomonroq talqinlarni tug'diradi.",
    },
    rhythm: 'principle',
    videos: ['082'],
  },
  {
    key: 'team-snachala-poprobovat-razgovor',
    title: {
      ru: 'Сначала попробовать разговор',
      uz: "Avval suhbatni sinab ko'ring",
    },
    why: {
      ru: 'Часть проблем решается до увольнения.',
      uz: "Muammolarning bir qismi ishdan bo'shatishgacha hal bo'ladi.",
    },
    rhythm: 'principle',
    videos: ['082'],
  },
  {
    key: 'team-produmat-rasstavanie-do-nachala',
    title: {
      ru: 'Продумать расставание до начала',
      uz: "Ajralishni boshlashdan oldin o'ylab qo'ying",
    },
    why: {
      ru: 'Три способа разрыва фиксируются заранее — по письменному соглашению, по выкупу доли, через посредника.',
      uz: "Uzilishning uch usuli oldindan qayd etiladi — yozma kelishuv bo'yicha, ulushni sotib olish bo'yicha, vositachi orqali.",
    },
    rhythm: 'principle',
    videos: ['083'],
  },
  {
    key: 'team-ne-oformlyat-obschee-delo-na-odnogo',
    title: {
      ru: 'Не оформлять общее дело на одного',
      uz: "Umumiy ishni bitta odamga rasmiylashtirmang",
    },
    why: {
      ru: 'Устные договорённости не работают. Доли, распределение прибыли и полномочия фиксируются юридически, а фундаментальные договорённости — отдельным документом.',
      uz: "Og'zaki kelishuvlar ishlamaydi. Ulushlar, foyda taqsimoti va vakolatlar yuridik qayd etiladi, tub kelishuvlar esa alohida hujjat bilan.",
    },
    rhythm: 'setup',
    videos: ['083'],
  },
  {
    key: 'team-vybirat-partnera-po-chetyrem-kriteriyam',
    title: {
      ru: 'Выбирать партнёра по четырём критериям',
      uz: "Sherikni to'rt mezon bo'yicha tanlang",
    },
    why: {
      ru: 'Репутация (проверяемая через общих знакомых), совпадение целей и ценностей, честная договорённость о пропорции вложений и рисков, и главное — вступать в партнёрство только ради того, чего не можете сами.',
      uz: "Obro' (umumiy tanishlar orqali tekshiriladigan), maqsad va qadriyatlarning mos kelishi, qo'yilma va tavakkal nisbati haqida halol kelishuv, va eng muhimi — sherikchilikka faqat o'zingiz qila olmaydigan narsa uchun kirish.",
    },
    rhythm: 'principle',
    videos: ['083'],
  },
  {
    key: 'team-partner-dopolnyaet-a-ne-dubliruet',
    title: {
      ru: 'Партнёр дополняет, а не дублирует',
      uz: "Sherik to'ldiradi, takrorlamaydi",
    },
    why: {
      ru: 'Не искать полного сходства: партнёр должен закрывать то, чего у вас нет. Но личный комфорт оценить честно — бытовое раздражение накапливается.',
      uz: "To'liq o'xshashlik izlamang: sherik sizda yo'q narsani yopishi kerak. Lekin shaxsiy qulaylikni halol baholang — maishiy g'ashlik to'planadi.",
    },
    rhythm: 'principle',
    videos: ['083'],
  },
  {
    key: 'team-pri-tupike-tretya-storona',
    title: {
      ru: 'При тупике — третья сторона',
      uz: "Tupikda — uchinchi tomon",
    },
    why: {
      ru: 'Посредник вместо эскалации.',
      uz: "Keskinlashtirish o'rniga vositachi.",
    },
    rhythm: 'principle',
    videos: ['083'],
  },
  {
    key: 'team-opredelit-segment-do-nayma',
    title: {
      ru: 'Определить сегмент до найма',
      uz: "Segmentni yollashdan oldin aniqlang",
    },
    why: {
      ru: 'B2B и B2C требуют разных людей. У вас оба: HoReCa — длинное согласование, розница — быстрая покупка.',
      uz: "B2B va B2C turli odamlarni talab qiladi. Sizda ikkalasi ham: HoReCa — uzoq kelishuv, chakana — tez xarid.",
    },
    rhythm: 'principle',
    videos: ['061'],
  },
  {
    key: 'team-ne-stroit-otdel-bez-opyta-samomu',
    title: {
      ru: 'Не строить отдел без опыта самому',
      uz: "Tajribasiz bo'lim qurmang",
    },
    why: {
      ru: 'Нанимать продавцов, ни разу не продав самому, значит не знать, что спрашивать и чему учить.',
      uz: "Bir marta ham o'zi sotmagan holda sotuvchilarni yollash — nima so'rash va nimaga o'rgatishni bilmaslik demakdir.",
    },
    rhythm: 'principle',
    videos: ['061'],
  },
  {
    key: 'team-nachinat-s-odnourovnevoy-struktury',
    title: {
      ru: 'Начинать с одноуровневой структуры',
      uz: "Bir bosqichli tuzilmadan boshlang",
    },
    why: {
      ru: 'Руководитель и продавцы, без промежуточных слоёв.',
      uz: "Rahbar va sotuvchilar, oraliq qatlamlarsiz.",
    },
    rhythm: 'principle',
    videos: ['061'],
  },
  {
    key: 'team-ohotniki-i-fermery',
    title: {
      ru: 'Охотники и фермеры',
      uz: "Ovchilar va fermerlar",
    },
    why: {
      ru: 'Одни добывают новых клиентов, другие удерживают существующих — это разные склады характера, и смешивать задачи вредно.',
      uz: "Birlari yangi mijoz topadi, boshqalari mavjudini ushlab qoladi — bu turli fe'l, va vazifalarni aralashtirish zararli.",
    },
    rhythm: 'principle',
    videos: ['061'],
  },
  {
    key: 'team-svyazat-dohod-prodavtsa-s-rezultatom',
    title: {
      ru: 'Связать доход продавца с результатом',
      uz: "Sotuvchi daromadini natijaga bog'lang",
    },
    why: {
      ru: 'Оклад плюс премия — быстрый способ связать доход с результатом. Соревнование работает при трёх условиях: понятные правила, прозрачный учёт, ощутимый приз.',
      uz: "Oylik plyus mukofot — daromadni natijaga bog'lashning tez yo'li. Musobaqa uch shartda ishlaydi: tushunarli qoidalar, shaffof hisob, sezilarli sovrin.",
    },
    rhythm: 'principle',
    videos: ['061', '077'],
  },
  {
    key: 'team-ne-obyasnyat-povedenie-cheloveka-ego-pokoleniem',
    title: {
      ru: 'Не объяснять поведение человека его поколением',
      uz: "Odamning xatti-harakatini avlodi bilan tushuntirmang",
    },
    why: {
      ru: 'Типология подменяет разговор. Модель полезна, только если обладает предсказательной силой; в остальных случаях прямой диалог узнаёт о человеке больше.',
      uz: "Tipologiya suhbatni almashtirib qo'yadi. Model faqat bashorat kuchiga ega bo'lsagina foydali; qolgan hollarda to'g'ridan-to'g'ri suhbat odam haqida ko'proq biladi.",
    },
    rhythm: 'principle',
    videos: ['011'],
  },
  {
    key: 'team-uchitsya-u-raznyh-vozrastov-adresno',
    title: {
      ru: 'Учиться у разных возрастов адресно',
      uz: "Turli yoshdan manzilli o'rganing",
    },
    why: {
      ru: 'Дисциплина у одних, скорость освоения нового у других. Развивать навыки и менять направление можно в любом возрасте.',
      uz: "Birlarida intizom, boshqalarida yangini o'zlashtirish tezligi. Ko'nikmani rivojlantirish va yo'nalishni o'zgartirish har qanday yoshda mumkin.",
    },
    rhythm: 'principle',
    videos: ['011'],
  },
  {
    key: 'team-ne-perenosit-chuzhie-issledovaniya-na-sebya',
    title: {
      ru: 'Не переносить чужие исследования на себя',
      uz: "Begona tadqiqotlarni o'zingizga ko'chirmang",
    },
    why: {
      ru: 'Возрастные исследования проводились на другом обществе. А к инвестиционным предложениям в рекламе относиться критически — совет, который канал даёт про самого себя.',
      uz: "Yosh bo'yicha tadqiqotlar boshqa jamiyatda o'tkazilgan. Reklamadagi investitsiya takliflariga esa tanqidiy qarang — bu maslahatni kanal o'zi haqida beradi.",
    },
    rhythm: 'principle',
    videos: ['011'],
  },
  {
    key: 'team-prodavat-pridetsya-vsem',
    title: {
      ru: 'Продавать придётся всем',
      uz: "Sotishga hammaga to'g'ri keladi",
    },
    why: {
      ru: 'Не только клиентам, но и команде, и партнёрам — идею, условия, изменения.',
      uz: "Faqat mijozlarga emas, jamoaga ham, sheriklarga ham — g'oyani, shartlarni, o'zgarishlarni.",
    },
    rhythm: 'principle',
    videos: ['098'],
  },
  {
    key: 'team-antikrizisnyy-shtab',
    title: {
      ru: 'Антикризисный штаб',
      uz: "Inqirozga qarshi shtab",
    },
    why: {
      ru: 'Не тянуть кризис в одиночку: небольшая группа самых надёжных людей, которая и придумывает, и внедряет.',
      uz: "Inqirozni yolg'iz tortmang: eng ishonchli odamlarning kichik guruhi, u ham o'ylab topadi, ham joriy qiladi.",
    },
    rhythm: 'principle',
    videos: ['107'],
  },
];
