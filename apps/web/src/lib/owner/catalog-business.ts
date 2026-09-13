import type { Practice } from './practices';

// Практики области «Дело».
//
// Здесь то, что система уже умеет, но чем не пользуются, — и то, что
// вообще не про код: зарегистрироваться в справочниках, написать
// инструкцию, проверить восстановление копии. В разборе такие пункты
// помечены «есть, но используется не так»; кодом их не закрыть, а без них
// половина построенного простаивает.

export const BUSINESS_PRACTICES: Practice[] = [
  {
    key: 'business-razvedka-pered-zahodom',
    title: {
      ru: 'Разведка до захода в заведение',
      uz: 'Muassasaga borishdan oldin razvedka',
    },
    why: {
      ru: 'Кухня, сегмент, блюда, имя шефа — поля в карточке заведения уже есть. Заполненные до разговора, они превращают заход из «здравствуйте, мы микрозелень» в предложение под конкретное меню.',
      uz: "Oshxona, segment, taomlar, oshpaz ismi — muassasa kartasida bu maydonlar allaqachon bor. Suhbatdan oldin to'ldirilgan bo'lsa, tashrif «salom, biz mikroko'kat» dan aniq menyuga mos taklifga aylanadi.",
    },
    rhythm: 'weekly',
    videos: ['087'],
  },
  {
    key: 'business-kartochki-v-spravochnikah',
    title: {
      ru: 'Карточка в картах и справочниках',
      uz: "Xaritalar va ma'lumotnomalarda karta",
    },
    why: {
      ru: 'Бесплатный канал, который прямо решает, найдут ли вас: 2ГИС, Google Maps, Яндекс. Для розницы и самовывоза это покупатели без бюджета — но только если карточка заведена и заполнена.',
      uz: "Sizni topadilarmi — shuni hal qiladigan bepul kanal: 2GIS, Google Maps, Yandex. Chakana va olib ketish uchun bu byudjetsiz xaridorlar — lekin faqat karta ochilgan va to'ldirilgan bo'lsa.",
    },
    rhythm: 'setup',
    videos: ['011'],
  },
  {
    key: 'business-komissii-v-tsenu',
    title: {
      ru: 'Комиссии канала — до назначения цены',
      uz: 'Kanal komissiyalari — narx belgilanishidan oldin',
    },
    why: {
      ru: 'Эквайринг, доставка, время курьера — удержания, которые вычитают ДО того, как названа цена. Себестоимость лотка система считает, стоимость канала в неё пока кладёте вы.',
      uz: "Ekvayring, yetkazib berish, kuryer vaqti — bular narx aytilishidan OLDIN ushlab qolinadi. Lotok tannarxini tizim hisoblaydi, kanal qiymatini hozircha unga siz qo'shasiz.",
    },
    rhythm: 'setup',
    videos: ['104'],
  },
  {
    key: 'business-reshat-po-pribyli',
    title: {
      ru: 'Решать по прибыли, а не по остатку на счёте',
      uz: 'Foydaga qarab qaror qiling, hisobdagi qoldiqqa emas',
    },
    why: {
      ru: 'Остаток включает чужие деньги: налоги, оплату поставщикам, авансы под невыполненные заказы. Экран «Финансы» вычитает их и показывает своё — смотреть надо туда, а не в банк.',
      uz: "Qoldiqda begona pul ham bor: soliqlar, yetkazib beruvchilarga to'lov, bajarilmagan buyurtmalar uchun avanslar. «Moliya» ekrani ularni chiqarib, o'zingiznikini ko'rsatadi — bankka emas, o'sha yerga qarash kerak.",
    },
    rhythm: 'principle',
    videos: ['016'],
  },
  {
    key: 'business-proverit-vosstanovlenie',
    title: {
      ru: 'Проверить восстановление из копии',
      uz: 'Zaxira nusxadan tiklanishni tekshirish',
    },
    why: {
      ru: 'Копия, из которой ни разу не восстанавливались, — это не копия, а предположение. Клиентская база дороже оборудования: её потерю не докупишь.',
      uz: "Hech qachon tiklanmagan nusxa — bu nusxa emas, taxmin. Mijozlar bazasi uskunadan qimmat: uni yo'qotsangiz, qayta sotib ololmaysiz.",
    },
    rhythm: 'quarterly',
    videos: ['063'],
  },
  {
    key: 'business-instruktsii-po-zadacham',
    title: {
      ru: 'Написать инструкции по задачам',
      uz: "Vazifalar bo'yicha yo'riqnoma yozish",
    },
    why: {
      ru: 'Инструкция нужна не для проверок, а чтобы к вам не шли по каждому вопросу — то есть чтобы вернуть время, ради которого помощника и нанимали. Норма высева — данные для системы; «что делать, если лоток заплесневел» — для человека.',
      uz: "Yo'riqnoma tekshiruv uchun emas, har savol bilan sizga kelmasliklari uchun kerak — ya'ni yordamchini yollagan sababingiz bo'lgan vaqtni qaytarish uchun. Ekish me'yori — tizim uchun ma'lumot; «lotok mog'orlasa nima qilish» — odam uchun.",
    },
    rhythm: 'setup',
    videos: ['026'],
  },
  {
    key: 'business-sut-s-pervogo-ekrana',
    title: {
      ru: 'Суть — с первого экрана соцсетей',
      uz: 'Mohiyat — ijtimoiy tarmoqning birinchi ekranidan',
    },
    why: {
      ru: 'Публикации уходят автоматически, но с первого экрана должно считываться, что вы производите и для кого. Иначе трафик приходит и не понимает, куда попал.',
      uz: "Nashrlar avtomatik chiqadi, lekin birinchi ekrandan nima ishlab chiqarayotganingiz va kim uchun ekani o'qilishi kerak. Aks holda trafik keladi va qayerga tushganini tushunmaydi.",
    },
    rhythm: 'setup',
    videos: ['011'],
  },
  {
    key: 'business-kontent-kotorym-delyatsya',
    title: {
      ru: 'Контент, которым делятся',
      uz: 'Ulashiladigan kontent',
    },
    why: {
      ru: 'Условие простое: поделиться должно быть полезно или приятно. Рост партии в ускоренной съёмке и подача блюда с вашей зеленью — сильный материал, который почти никто в нише не снимает.',
      uz: "Shart oddiy: ulashish foydali yoki yoqimli bo'lishi kerak. Tezlashtirilgan suratda partiyaning o'sishi va sizning ko'katingiz bilan taom taqdimoti — kuchli material, buni sohada deyarli hech kim suratga olmaydi.",
    },
    rhythm: 'weekly',
    videos: ['011', '074'],
  },
  {
    key: 'business-finmodel-dlya-sebya',
    title: {
      ru: 'Пересобрать финмодель для себя, а не для гранта',
      uz: "Moliyaviy modelni grant uchun emas, o'zingiz uchun qayta yig'ing",
    },
    why: {
      ru: 'Модель под заявку показывает лучший сценарий — это её работа. Своя должна включать налоги, худший сценарий и пересобираться регулярно, иначе она описывает не ваше дело.',
      uz: "Ariza uchun model eng yaxshi ssenariyni ko'rsatadi — bu uning ishi. O'zingiznikida soliqlar va eng yomon ssenariy bo'lishi, hamda u muntazam qayta yig'ilishi kerak, aks holda u sizning ishingizni tasvirlamaydi.",
    },
    rhythm: 'quarterly',
    videos: ['009', '098'],
  },
  {
    key: 'business-propusknaya-sposobnost',
    title: {
      ru: 'Посчитать реальный потолок производства',
      uz: 'Ishlab chiqarishning haqiqiy shiftini hisoblash',
    },
    why: {
      ru: 'Сколько лотков вы физически растите и развозите. «Ужмёмся и справимся» не работает: цикл не ускорить, а день имеет границы — и обещание сверх потолка срывает срок не вам одному.',
      uz: "Jismonan qancha lotok o'stirib, tarqata olasiz. «Qisilamiz va uddalaymiz» ishlamaydi: siklni tezlashtirib bo'lmaydi, kunning esa chegarasi bor — shiftdan ortiq va'da muddatni faqat sizga emas, boshqalarga ham buzadi.",
    },
    rhythm: 'setup',
    videos: ['098'],
  },
  {
    key: 'business-sverka-plana-s-faktom',
    title: {
      ru: 'Сверить план с фактом',
      uz: 'Rejani fakt bilan solishtirish',
    },
    why: {
      ru: 'Раз в месяц: что собирались и что вышло. Без сверки план превращается в намерение, а отчёт — в чтение задним числом.',
      uz: "Oyda bir marta: nima ko'zlangan va nima chiqqan. Solishtirmasa reja niyatga, hisobot esa orqaga qarab o'qishga aylanadi.",
    },
    rhythm: 'monthly',
    videos: ['098'],
  },
  {
    key: 'business-reglamenty-i-orgstruktura',
    title: {
      ru: 'Описать процессы и кто за что отвечает',
      uz: "Jarayonlarni va kim nimaga javob berishini yozib qo'yish",
    },
    why: {
      ru: 'Делегировать нечего, пока процесс живёт в голове. «По ощущению» заменяется измеримой формулировкой, иначе спросить за результат не с чего.',
      uz: "Jarayon boshda turar ekan, topshirishga narsa yo'q. «Tuyg'u bo'yicha» o'lchanadigan ta'rif bilan almashtiriladi, aks holda natija uchun so'rashga asos yo'q.",
    },
    rhythm: 'setup',
    videos: ['026', '098'],
  },
  {
    key: 'business-sdelat-zhalobu-legkoy',
    title: {
      ru: 'Сделать жалобу лёгкой',
      uz: 'Shikoyatni oson qilish',
    },
    why: {
      ru: 'Молчащий недовольный опаснее жалующегося: он просто уходит, и причина остаётся неизвестной. Спрашивать прямо и дать простой способ ответить дешевле, чем терять точку без объяснений.',
      uz: "Jim norozi shikoyat qilganidan xavfliroq: u shunchaki ketadi, sabab esa noma'lum qoladi. To'g'ridan-to'g'ri so'rash va javob berishning oddiy yo'lini berish nuqtani tushuntirishsiz yo'qotishdan arzonroq.",
    },
    rhythm: 'setup',
    videos: ['017'],
  },
  {
    key: 'business-poryadok-v-baze-i-segmenty',
    title: {
      ru: 'Навести порядок в базе и разложить по сегментам',
      uz: 'Bazani tartibga solib, segmentlarga ajratish',
    },
    why: {
      ru: 'Поля для этого есть: тип клиента, тип компании, сегмент заведения, кухня. Разным группам нужны разные предложения, но только если группы размечены.',
      uz: "Buning uchun maydonlar bor: mijoz turi, kompaniya turi, muassasa segmenti, oshxona. Turli guruhlarga turli takliflar kerak, lekin faqat guruhlar belgilangan bo'lsa.",
    },
    rhythm: 'monthly',
    videos: ['069'],
  },
  {
    key: 'business-obeschat-vypolnimoe',
    title: {
      ru: 'Обещать выполнимое и предупреждать заранее',
      uz: "Bajariladiganini va'da qiling va oldindan ogohlantiring",
    },
    why: {
      ru: 'Несорванный срок незаметен, сорванный без предупреждения пересказывают. Посадки показывают, что и когда будет готово, — предупредить есть чем и до того, как стало поздно.',
      uz: "Buzilmagan muddat sezilmaydi, ogohlantirishsiz buzilgani esa og'izdan-og'izga o'tadi. Ekishlar nima qachon tayyor bo'lishini ko'rsatadi — kech bo'lgunga qadar ogohlantirishga asos bor.",
    },
    rhythm: 'principle',
    videos: ['087'],
  },
  {
    key: 'business-aktsiya-na-dlinu-tsikla',
    title: {
      ru: 'Акцию планировать на длину цикла вперёд',
      uz: 'Aksiyani sikl uzunligicha oldinga rejalashtiring',
    },
    why: {
      ru: 'Нарастить выпуск за день невозможно: цикл занимает от недели. Сорванные во время акции сроки обходятся дороже, чем весь выигрыш от неё.',
      uz: "Bir kunda ishlab chiqarishni oshirib bo'lmaydi: sikl bir haftadan boshlanadi. Aksiya paytida buzilgan muddatlar undan olingan butun yutuqdan qimmatga tushadi.",
    },
    rhythm: 'principle',
    videos: ['104'],
  },
  {
    key: 'business-gotovitsya-do-vstrechi',
    title: {
      ru: 'Готовиться до встречи, а не за столом',
      uz: 'Uchrashuvgacha tayyorlaning, stol ortida emas',
    },
    why: {
      ru: 'Цель, изучить собеседника и заведение, формат, варианты исхода, аргументы. Подготовка решает больше, чем поведение в разговоре, и профиль заведения для неё уже заполняется.',
      uz: "Maqsad, suhbatdosh va muassasani o'rganish, format, natija variantlari, dalillar. Tayyorgarlik suhbatdagi xatti-harakatdan ko'ra ko'proq hal qiladi, va muassasa profili buning uchun allaqachon to'ldirilmoqda.",
    },
    rhythm: 'principle',
    videos: ['107'],
  },
  {
    key: 'business-klyuchevye-klienty-otdelno',
    title: {
      ru: 'Ключевым заведениям — отдельное внимание',
      uz: "Kalit muassasalarga — alohida e'tibor",
    },
    why: {
      ru: 'Самые крупные не должны стоять в общей очереди объезда. Их уход весит больше остальных, и заметить охлаждение надо раньше, чем оно станет отказом.',
      uz: "Eng yiriklari umumiy aylanma navbatida turmasligi kerak. Ularning ketishi boshqalarnikidan og'irroq, va sovishni rad javobga aylanishidan oldin sezish kerak.",
    },
    rhythm: 'monthly',
    videos: ['026'],
  },
  {
    key: 'business-tri-postavschika-na-pozitsiyu',
    title: {
      ru: 'Найти второго и третьего поставщика',
      uz: 'Ikkinchi va uchinchi yetkazib beruvchini topish',
    },
    why: {
      ru: 'Система уже говорит, по каким позициям возит ровно один. Найти запасных — работа не её: без выбора не с чем торговаться, а отказ единственного останавливает посев.',
      uz: "Tizim qaysi pozitsiyalarni faqat bittasi olib kelishini aytadi. Zaxiralarini topish — uning ishi emas: tanlovsiz savdolashishga asos yo'q, yagonasining rad javobi esa ekishni to'xtatadi.",
    },
    rhythm: 'quarterly',
    videos: ['098'],
  },
];
