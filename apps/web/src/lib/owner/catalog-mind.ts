import type { Practice } from './practices';

// Практики области «Мышление и решения».
//
// Содержимое, а не логика: вытащено из разбора канала, где за каждой
// строкой стоит несколько советов. Ритм — предположение, и владелец
// меняет его на экране: своя неделя виднее отсюда.

export const MIND_PRACTICES: Practice[] = [
  {
    key: 'mind-tri-proverochnyh-voprosa',
    title: {
      ru: 'Три проверочных вопроса',
      uz: "Uch tekshiruv savoli",
    },
    why: {
      ru: 'Кто сказал, на чём основано, кому выгодно. Плюс привычка ходить по ссылке на первоисточник: заинтересованная сторона цитирует выборочно.',
      uz: "Kim aytdi, nimaga asoslangan, kimga foydali. Ustiga birlamchi manbaga havola bo'yicha o'tish odati: manfaatdor tomon tanlab iqtibos keltiradi.",
    },
    rhythm: 'principle',
    videos: ['013'],
  },
  {
    key: 'mind-otdelyat-fakt-ot-otsenki',
    title: {
      ru: 'Отделять факт от оценки',
      uz: "Faktni bahodan ajrating",
    },
    why: {
      ru: '«Лучшее качество» — оценка. «Всхожесть 95% по протоколу проверки» — факт.',
      uz: "«Eng yaxshi sifat» — baho. «Tekshiruv bayonnomasi bo'yicha unuvchanlik 95%» — fakt.",
    },
    rhythm: 'principle',
    videos: ['013'],
  },
  {
    key: 'mind-iskat-pervoprichinu',
    title: {
      ru: 'Искать первопричину',
      uz: "Asosiy sababni qidiring",
    },
    why: {
      ru: 'Диаграмма Исикавы («рыбья кость») и техника «пять почему» — последовательное углубление до настоящей причины.',
      uz: "Isikava diagrammasi («baliq suyagi») va «besh nega» usuli — haqiqiy sababgacha ketma-ket chuqurlashish.",
    },
    rhythm: 'principle',
    videos: ['013'],
  },
  {
    key: 'mind-pauza-pered-vazhnym-resheniem',
    title: {
      ru: 'Пауза перед важным решением',
      uz: "Muhim qarordan oldin pauza",
    },
    why: {
      ru: 'Не решать под давлением. Замедлять важные решения намеренно — таймером или отсрочкой.',
      uz: "Bosim ostida qaror qilmang. Muhim qarorlarni ataylab sekinlashtiring — taymer yoki kechiktirish bilan.",
    },
    rhythm: 'daily',
    videos: ['013', '029'],
  },
  {
    key: 'mind-umnyy-opponent-ryadom',
    title: {
      ru: 'Умный оппонент рядом',
      uz: "Yonda aqlli raqib",
    },
    why: {
      ru: 'Человек, который скажет прямо, что вы неправы. Ценность его в том, что он единственный источник обратной связи, которого у владельца обычно нет.',
      uz: "Sizga to'g'ridan-to'g'ri «siz nohaqsiz» deydigan odam. Uning qimmati shundaki, u egada odatda bo'lmaydigan yagona teskari aloqa manbai.",
    },
    rhythm: 'setup',
    videos: ['013', '029'],
  },
  {
    key: 'mind-priznavat-svoyu-nepravotu',
    title: {
      ru: 'Признавать свою неправоту',
      uz: "Nohaqligingizni tan oling",
    },
    why: {
      ru: 'Тренируемый навык, а не черта характера.',
      uz: "Bu xarakter xususiyati emas, mashq qilinadigan ko'nikma.",
    },
    rhythm: 'principle',
    videos: ['013'],
  },
  {
    key: 'mind-pokupat-konsultatsiyu-i-sveryat-mneniya',
    title: {
      ru: 'Покупать консультацию и сверять мнения',
      uz: "Maslahat sotib oling va fikrlarni solishtiring",
    },
    why: {
      ru: 'Несколько независимых специалистов вместо одного.',
      uz: "Bittasi o'rniga bir necha mustaqil mutaxassis.",
    },
    rhythm: 'principle',
    videos: ['013'],
  },
  {
    key: 'mind-oshibka-vyzhivshego',
    title: {
      ru: 'Ошибка выжившего',
      uz: "Omon qolgan xatosi",
    },
    why: {
      ru: 'Яркие истории отобраны по результату — провалы с теми же действиями просто не рассказывают.',
      uz: "Yorqin hikoyalar natija bo'yicha tanlangan — xuddi shu harakatlar bilan muvaffaqiyatsizliklar haqida shunchaki gapirishmaydi.",
    },
    rhythm: 'principle',
    videos: ['013', '059'],
  },
  {
    key: 'mind-dve-sistemy-myshleniya',
    title: {
      ru: 'Две системы мышления',
      uz: "Ikki tafakkur tizimi",
    },
    why: {
      ru: 'Быстрое автоматическое и медленное осознанное. Эвристики — умственные сокращения, которые экономят силы и регулярно ошибаются.',
      uz: "Tez avtomatik va sekin ongli. Evristikalar — kuchni tejaydigan va muntazam xato qiladigan aqliy qisqartmalar.",
    },
    rhythm: 'principle',
    videos: ['029'],
  },
  {
    key: 'mind-nevozvratnye-zatraty',
    title: {
      ru: 'Невозвратные затраты',
      uz: "Qaytmas xarajatlar",
    },
    why: {
      ru: 'Продолжать вкладываться, потому что уже вложено. Для вас — направление или культура, которую вы тянете из-за потраченного, а не из-за перспектив.',
      uz: "Allaqachon qo'yilgani uchun qo'yishda davom etish. Siz uchun — istiqbol uchun emas, sarflangan uchun tortib yurgan yo'nalish yoki ekin.",
    },
    rhythm: 'principle',
    videos: ['029'],
  },
  {
    key: 'mind-predvzyatost-podtverzhdeniya',
    title: {
      ru: 'Предвзятость подтверждения',
      uz: "Tasdiqni izlash ogohligi",
    },
    why: {
      ru: 'Искать данные против своей позиции — самая неприятная и самая полезная привычка.',
      uz: "O'z pozitsiyangizga qarshi ma'lumot izlash — eng yoqimsiz va eng foydali odat.",
    },
    rhythm: 'principle',
    videos: ['029'],
  },
  {
    key: 'mind-evristika-dostupnosti',
    title: {
      ru: 'Эвристика доступности',
      uz: "Mavjudlik evristikasi",
    },
    why: {
      ru: 'Запоминаемость не равна вероятности. Одна яркая история о провале не делает риск высоким, и наоборот.',
      uz: "Esda qolish ehtimollikka teng emas. Muvaffaqiyatsizlik haqidagi bitta yorqin hikoya tavakkalni yuqori qilmaydi, va aksincha.",
    },
    rhythm: 'principle',
    videos: ['029'],
  },
  {
    key: 'mind-galo-effekt-i-freyming',
    title: {
      ru: 'Гало-эффект и фрейминг',
      uz: "Galo-effekt va freyming",
    },
    why: {
      ru: 'Общее впечатление о человеке влияет на оценку его конкретных качеств. А одно и то же предложение воспринимается по-разному в зависимости от подачи — отделяйте суть от формы, особенно когда вам что-то продают.',
      uz: "Odam haqidagi umumiy taassurot uning aniq sifatlarini baholashga ta'sir qiladi. Bir xil taklif esa taqdimotga qarab har xil qabul qilinadi — mohiyatni shakldan ajrating, ayniqsa sizga nimadir sotilayotganda.",
    },
    rhythm: 'principle',
    videos: ['029'],
  },
  {
    key: 'mind-zapisyvat-hod-rassuzhdeniya',
    title: {
      ru: 'Записывать ход рассуждения',
      uz: "Mulohaza yo'lini yozib boring",
    },
    why: {
      ru: 'Не только вывод, но и путь к нему. Через месяц видно, где ошибка.',
      uz: "Faqat xulosani emas, unga olib borgan yo'lni ham. Bir oydan keyin xato qayerda ekani ko'rinadi.",
    },
    rhythm: 'daily',
    videos: ['029'],
  },
  {
    key: 'mind-otsenivat-svoi-mysli-kak-chuzhie',
    title: {
      ru: 'Оценивать свои мысли как чужие',
      uz: "O'z fikringizni begonaniki kabi baholang",
    },
    why: {
      ru: 'Критика собственной идеи с дистанции.',
      uz: "O'z g'oyangizni masofadan turib tanqid qilish.",
    },
    rhythm: 'principle',
    videos: ['029'],
  },
  {
    key: 'mind-sindromy-kotorye-meshayut-umnym',
    title: {
      ru: 'Синдромы, которые мешают умным',
      uz: "Aqllilarga xalaqit beradigan sindromlar",
    },
    why: {
      ru: 'Пять разобранных: карго — копирование атрибутов вместо действий; ожидание одобрения; самозванец — недооценка себя; Даннинга-Крюгера — переоценка при малом знании; утёнок — привязка к первому известному способу.',
      uz: "Beshtasi ko'rib chiqilgan: kargo — harakat o'rniga atributlarni nusxalash; ma'qullash kutish; o'zini firibgar his qilish — o'zini kam baholash; Danning-Kryuger — kam bilimda ortiqcha baholash; o'rdakcha — birinchi ma'lum usulga bog'lanib qolish.",
    },
    rhythm: 'principle',
    videos: ['017'],
  },
  {
    key: 'mind-ustalost-ot-prinyatiya-resheniy',
    title: {
      ru: 'Усталость от принятия решений',
      uz: "Qaror qabul qilishdan charchash",
    },
    why: {
      ru: 'Запас внимания ограничен и тратится на любой выбор. Отсюда: свести повторяющийся выбор к рутине и поставить важные решения на своё лучшее время суток.',
      uz: "Diqqat zaxirasi cheklangan va har qanday tanlovga sarflanadi. Shundan: takrorlanuvchi tanlovni odatga aylantiring va muhim qarorlarni kuningizning eng yaxshi vaqtiga qo'ying.",
    },
    rhythm: 'principle',
    videos: ['017'],
  },
  {
    key: 'mind-kritika-kak-besplatnyy-konsalting',
    title: {
      ru: 'Критика как бесплатный консалтинг',
      uz: "Tanqid — bepul konsalting",
    },
    why: {
      ru: 'Разбор со стороны стоит денег, а недовольный клиент отдаёт его даром — если дослушать до конца, а не защищаться.',
      uz: "Chetdan tahlil pul turadi, norozi mijoz esa uni tekin beradi — agar himoyalanmay, oxirigacha tinglasangiz.",
    },
    rhythm: 'principle',
    videos: ['017'],
  },
  {
    key: 'mind-menyat-po-odnomu-protsessu-za-raz',
    title: {
      ru: 'Менять по одному процессу за раз',
      uz: "Bir vaqtda bitta jarayonni o'zgartiring",
    },
    why: {
      ru: 'Иначе непонятно, что сработало. И маленькое действие сегодня лучше большого плана на потом.',
      uz: "Aks holda nima ishlaganini bilib bo'lmaydi. Va bugungi kichik harakat keyingi katta rejadan yaxshiroq.",
    },
    rhythm: 'principle',
    videos: ['017'],
  },
  {
    key: 'mind-priemy-kotorye-nado-uznavat',
    title: {
      ru: 'Приёмы, которые надо узнавать',
      uz: "Tanib olish kerak bo'lgan usullar",
    },
    why: {
      ru: 'Ложная дилемма — выбор из двух заведомо неполных вариантов; вскрывается вопросом о самом выборе.',
      uz: "Yolg'on dilemma — atayin to'liq bo'lmagan ikki variantdan tanlov; tanlovning o'zi haqidagi savol bilan ochiladi.",
    },
    rhythm: 'principle',
    videos: ['008'],
  },
  {
    key: 'mind-davlenie-na-emotsii',
    title: {
      ru: 'Давление на эмоции',
      uz: "Hissiyotga bosim",
    },
    why: {
      ru: 'Страх упущенной выгоды, ловушка стыда («все нормальные так делают»), давление на вину, лесть.',
      uz: "Boy berilgan foyda qo'rquvi, uyat tuzog'i («hamma normal odamlar shunday qiladi»), aybdorlikka bosim, xushomad.",
    },
    rhythm: 'principle',
    videos: ['008'],
  },
  {
    key: 'mind-ne-reshat-v-vozbuzhdennom-sostoyanii',
    title: {
      ru: 'Не решать в возбуждённом состоянии',
      uz: "Hayajonlangan holatda qaror qilmang",
    },
    why: {
      ru: 'На эмоции решения выходят крупнее и хуже. Отложить до утра дешевле, чем потом отменять.',
      uz: "Hissiyot ustida qarorlar yiriroq va yomonroq chiqadi. Ertagacha qoldirish keyin bekor qilishdan arzon.",
    },
    rhythm: 'principle',
    videos: ['008'],
  },
  {
    key: 'mind-repetitsiya-i-vtoroy-chelovek',
    title: {
      ru: 'Репетиция и второй человек',
      uz: "Mashq va ikkinchi odam",
    },
    why: {
      ru: 'Прогнать трудный разговор вслух заранее. На сложные переговоры идти вдвоём — второй замечает то, что вы пропустите.',
      uz: "Qiyin suhbatni oldindan ovoz chiqarib o'tkazing. Murakkab muzokaraga ikki kishi boring — ikkinchisi siz o'tkazib yuboradiganini sezadi.",
    },
    rhythm: 'principle',
    videos: ['008'],
  },
  {
    key: 'mind-lestnitsa-neudobstva',
    title: {
      ru: 'Лестница неудобства',
      uz: "Noqulaylik zinapoyasi",
    },
    why: {
      ru: 'Тренировать умение быть неудобным по возрастающей — от мелочей к серьёзному.',
      uz: "Noqulay bo'la olish ko'nikmasini o'sib boruvchi tartibda mashq qiling — maydadan jiddiyga.",
    },
    rhythm: 'principle',
    videos: ['008'],
  },
  {
    key: 'mind-otlichit-eksperta-ot-prodavtsa-vozduha',
    title: {
      ru: 'Отличить эксперта от продавца воздуха',
      uz: "Ekspertni havo sotuvchisidan ajrating",
    },
    why: {
      ru: 'Пять уловок: гарантированный результат, искусственный дефицит, демонстрация богатства вместо доказательств, отобранные кейсы, давление на боль.',
      uz: "Besh hiyla: kafolatlangan natija, sun'iy taqchillik, dalil o'rniga boylik namoyishi, tanlangan keyslar, og'riqqa bosim.",
    },
    rhythm: 'principle',
    videos: ['059'],
  },
  {
    key: 'mind-opredelit-tsel-obucheniya-i-svoyu-polovinu',
    title: {
      ru: 'Определить цель обучения и свою половину ответственности',
      uz: "O'qish maqsadini va o'z javobgarligingizni aniqlang",
    },
    why: {
      ru: 'Хороший курс экономит время, структурируя знания, — но результат зависит от вас наполовину.',
      uz: "Yaxshi kurs bilimni tartibga solib vaqtni tejaydi — lekin natija yarmi sizga bog'liq.",
    },
    rhythm: 'principle',
    videos: ['059'],
  },
  {
    key: 'mind-vrednye-sovety-kak-zhanr',
    title: {
      ru: 'Вредные советы как жанр',
      uz: "Zararli maslahatlar — janr sifatida",
    },
    why: {
      ru: 'Выпуск построен наоборот: перечисляются антипаттерны. Управленческие — власть на давлении, победа в споре вместо компромисса, игнорирование проблемы, пренебрежение людьми без счёта стоимости их замены.',
      uz: "Son teskari qurilgan: antipatternlar sanab o'tiladi. Boshqaruvdagilari — bosimga qurilgan hokimiyat, murosaga o'rniga bahsda g'alaba, muammoni e'tiborsiz qoldirish, o'rnini almashtirish narxini hisoblamay odamlarga mensimay qarash.",
    },
    rhythm: 'principle',
    videos: ['041'],
  },
  {
    key: 'mind-dengi-i-reputatsiya-antipatterny',
    title: {
      ru: 'Деньги и репутация: антипаттерны',
      uz: "Pul va obro': antipatternlar",
    },
    why: {
      ru: 'Не выводить всю поступившую оплату, отвечать на сообщения, держать договорённости по времени, слушать клиента и после предоплаты, не вести переговоры давлением, читать договоры целиком включая мелкий шрифт, не брать кредит на статусную…',
      uz: "Kelgan to'lovning hammasini yechib olmang, xabarlarga javob bering, vaqt bo'yicha kelishuvda turing, oldindan to'lovdan keyin ham mijozni tinglang, muzokarani bosim bilan olib bormang, shartnomalarni mayda shrift bilan qo'shib to'liq o'qing, maqom uchun kredit olmang.",
    },
    rhythm: 'principle',
    videos: ['041'],
  },
  {
    key: 'mind-mif-mnogozadachnosti',
    title: {
      ru: 'Миф многозадачности',
      uz: "Ko'p vazifalilik afsonasi",
    },
    why: {
      ru: 'Мозг не делает два дела сразу — он переключается, и каждое переключение стоит. Эволюционное несоответствие: устройство внимания не рассчитано на нынешний поток информации.',
      uz: "Miya ikki ishni bir vaqtda qilmaydi — u almashadi, va har bir almashuv narx turadi. Evolyutsion nomuvofiqlik: diqqat tuzilishi hozirgi axborot oqimiga mo'ljallanmagan.",
    },
    rhythm: 'principle',
    videos: ['034'],
  },
  {
    key: 'mind-informatsionnaya-gigiena',
    title: {
      ru: 'Информационная гигиена',
      uz: "Axborot gigiyenasi",
    },
    why: {
      ru: 'Отписки, лимиты на приложения, смартфон вне спальни, однофункциональные устройства. Шесть симптомов информационной усталости приводятся как самодиагностика.',
      uz: "Obunani bekor qilish, ilovalarga limit, smartfon yotoqxonadan tashqarida, bir vazifali qurilmalar. Axborot charchoqining olti alomati o'z-o'zini tekshirish uchun keltiriladi.",
    },
    rhythm: 'principle',
    videos: ['034'],
  },
  {
    key: 'mind-meditatsiya-v-shirokom-smysle',
    title: {
      ru: 'Медитация в широком смысле',
      uz: "Keng ma'nodagi meditatsiya",
    },
    why: {
      ru: 'Любое занятие без разделения внимания считается. Для вас это фасовка и промывка — работа, при которой голова отдыхает.',
      uz: "Diqqatni bo'lmasdan qilinadigan har qanday mashg'ulot hisobga olinadi. Siz uchun bu qadoqlash va yuvish — bosh dam oladigan ish.",
    },
    rhythm: 'principle',
    videos: ['034'],
  },
  {
    key: 'mind-zhivoe-obschenie-i-oflayn-navyk',
    title: {
      ru: 'Живое общение и офлайн-навык',
      uz: "Jonli muloqot va oflayn ko'nikma",
    },
    why: {
      ru: 'Навык разговора тупится без практики, а сбыт в заведения держится именно на нём.',
      uz: "Suhbat ko'nikmasi mashqsiz o'tmaslashadi, muassasalarga sotuv esa aynan shunga tayanadi.",
    },
    rhythm: 'principle',
    videos: ['034'],
  },
  {
    key: 'mind-ne-spisyvat-ustalost-na-harakter',
    title: {
      ru: 'Не списывать усталость на характер',
      uz: "Charchoqni xarakterga yozmang",
    },
    why: {
      ru: 'И не разбрасываться медицинскими терминами — важная оговорка канала против самодиагностики.',
      uz: "Va tibbiy atamalarni sochmang — kanalning o'z-o'ziga tashxis qo'yishga qarshi muhim izohi.",
    },
    rhythm: 'principle',
    videos: ['034'],
  },
  {
    key: 'mind-kak-rabotaet-pamyat',
    title: {
      ru: 'Как работает память',
      uz: "Xotira qanday ishlaydi",
    },
    why: {
      ru: 'Три вида памяти; проговаривание вслух фиксирует действие; много подряд не запоминается; при высокой нагрузке на память рассчитывать нельзя.',
      uz: "Uch xil xotira; ovoz chiqarib aytish harakatni qayd etadi; ketma-ket ko'pi esda qolmaydi; yuk yuqori bo'lganda xotiraga tayanib bo'lmaydi.",
    },
    rhythm: 'principle',
    videos: ['024'],
  },
  {
    key: 'mind-metod-dvortsa-son-i-dvizhenie',
    title: {
      ru: 'Метод дворца, сон и движение',
      uz: "Saroy usuli, uyqu va harakat",
    },
    why: {
      ru: 'Сон переносит в долговременную память, физическая активность способствует нейрогенезу.',
      uz: "Uyqu uzoq muddatli xotiraga o'tkazadi, jismoniy faollik neyrogenezga yordam beradi.",
    },
    rhythm: 'principle',
    videos: ['024'],
  },
  {
    key: 'mind-lozhnye-vospominaniya',
    title: {
      ru: 'Ложные воспоминания',
      uz: "Yolg'on xotiralar",
    },
    why: {
      ru: 'Ярким воспоминаниям о деталях доверять нельзя. Отсюда практическое: договорённости с заведением записывать, а не помнить — обе стороны помнят по-разному и обе искренне.',
      uz: "Tafsilotlar haqidagi yorqin xotiralarga ishonib bo'lmaydi. Shundan amaliysi: muassasa bilan kelishuvlarni eslab emas, yozib qo'ying — ikki tomon ham har xil eslaydi va ikkalasi ham samimiy.",
    },
    rhythm: 'principle',
    videos: ['024'],
  },
  {
    key: 'mind-kreativnost-navyk',
    title: {
      ru: 'Креативность — навык',
      uz: "Ijodkorlik — ko'nikma",
    },
    why: {
      ru: 'Тренируется, а не даётся от рождения.',
      uz: "Tug'ilishdan berilmaydi, mashq qilinadi.",
    },
    rhythm: 'principle',
    videos: ['025'],
  },
  {
    key: 'mind-soedinenie-dvuh-idey',
    title: {
      ru: 'Соединение двух идей',
      uz: "Ikki g'oyani qo'shish",
    },
    why: {
      ru: 'Формула «1 + 1 = 3»: третья идея рождается из соединения двух чужих. Заимствовать много и из разных мест, смотреть на природу и смежные отрасли — заимствование отличается от плагиата переработкой.',
      uz: "«1 + 1 = 3» formulasi: uchinchi g'oya ikki begonasining qo'shilishidan tug'iladi. Ko'p va turli joydan o'zlashtiring, tabiatga va qo'shni sohalarga qarang — o'zlashtirish plagiatdan qayta ishlash bilan farq qiladi.",
    },
    rhythm: 'principle',
    videos: ['025'],
  },
  {
    key: 'mind-mozgovoy-shturm-bez-kritiki',
    title: {
      ru: 'Мозговой штурм без критики',
      uz: "Tanqidsiz aqliy hujum",
    },
    why: {
      ru: 'Сначала количество без оценки, потом уточнение и объединение. Право на плохие идеи — условие появления хороших.',
      uz: "Avval bahosiz miqdor, keyin aniqlashtirish va birlashtirish. Yomon g'oyalarga huquq — yaxshilari paydo bo'lishining sharti.",
    },
    rhythm: 'principle',
    videos: ['025'],
  },
  {
    key: 'mind-nulevoy-nabrosok',
    title: {
      ru: 'Нулевой набросок',
      uz: "Nolinchi qoralama",
    },
    why: {
      ru: 'Заведомо черновая первая версия. Та же мысль, что «делай плохо, но делай» в 08.',
      uz: "Atayin qoralama birinchi versiya. 08-dagi «yomon qiling, lekin qiling» bilan bir xil fikr.",
    },
    rhythm: 'principle',
    videos: ['025'],
  },
  {
    key: 'mind-bank-idey-i-nasmotrennost',
    title: {
      ru: 'Банк идей и насмотренность',
      uz: "G'oyalar banki va ko'z o'rganishi",
    },
    why: {
      ru: 'Одно место для записи идей, смена маршрутов, системное накопление насмотренности.',
      uz: "G'oyalarni yozish uchun bitta joy, marshrutlarni almashtirish, ko'z o'rganishini tizimli to'plash.",
    },
    rhythm: 'setup',
    videos: ['025'],
  },
  {
    key: 'mind-deystvovat-do-poyavleniya-uverennosti',
    title: {
      ru: 'Действовать до появления уверенности',
      uz: "Ishonch paydo bo'lguncha harakat qiling",
    },
    why: {
      ru: 'Уверенность приходит из действия, а не наоборот. Её можно переносить из области, где вы уже сильны.',
      uz: "Ishonch harakatdan keladi, aksincha emas. Uni o'zingiz kuchli bo'lgan sohadan ko'chirish mumkin.",
    },
    rhythm: 'principle',
    videos: ['004'],
  },
  {
    key: 'mind-formula-samootsenki',
    title: {
      ru: 'Формула самооценки',
      uz: "O'zini baholash formulasi",
    },
    why: {
      ru: 'Самооценка = достигнутое ÷ притязания. Отсюда два способа её поднять — и второй (снизить завышенные притязания) обычно игнорируют.',
      uz: "O'zini baholash = erishilgani ÷ da'volar. Shundan uni ko'tarishning ikki yo'li — ikkinchisini (oshirib yuborilgan da'volarni pasaytirish) odatda e'tiborsiz qoldiradilar.",
    },
    rhythm: 'principle',
    videos: ['004'],
  },
  {
    key: 'mind-ne-soglashatsya-na-menshee',
    title: {
      ru: 'Не соглашаться на меньшее',
      uz: "Kamiga rozi bo'lmang",
    },
    why: {
      ru: 'Расширять границы постепенно, тренировать неудобные разговоры на мелочах, помнить, чей комфорт вы защищаете, соглашаясь на невыгодное.',
      uz: "Chegaralarni bosqichma-bosqich kengaytiring, noqulay suhbatlarni maydalarda mashq qiling, foydasiziga rozi bo'lganda kimning qulayligini himoya qilayotganingizni eslang.",
    },
    rhythm: 'principle',
    videos: ['004'],
  },
  {
    key: 'mind-tehnika-nu-i-chto',
    title: {
      ru: 'Техника «ну и что?»',
      uz: "«Xo'sh, nima bo'pti?» usuli",
    },
    why: {
      ru: 'Назвать худший исход вслух — он почти всегда оказывается переносимым.',
      uz: "Eng yomon natijani ovoz chiqarib ayting — u deyarli har doim chidasa bo'ladigan bo'lib chiqadi.",
    },
    rhythm: 'principle',
    videos: ['004'],
  },
  {
    key: 'mind-derzhat-obeschaniya-sebe',
    title: {
      ru: 'Держать обещания себе',
      uz: "O'zingizga bergan va'dada turing",
    },
    why: {
      ru: 'Самосаботаж разрушает доверие к себе быстрее чужих отказов.',
      uz: "O'z-o'zini sabotaj o'ziga ishonchni begona rad javoblaridan tezroq buzadi.",
    },
    rhythm: 'principle',
    videos: ['004'],
  },
  {
    key: 'mind-styd-kak-vhodnaya-plata',
    title: {
      ru: 'Стыд как входная плата',
      uz: "Uyat — kirish to'lovi",
    },
    why: {
      ru: 'Неловкость — признак роста. Доза снижается тренировкой на мелочах.',
      uz: "Noqulaylik — o'sish belgisi. Dozasi maydalardagi mashq bilan pasayadi.",
    },
    rhythm: 'principle',
    videos: ['018'],
  },
  {
    key: 'mind-gnev-i-granitsy',
    title: {
      ru: 'Гнев и границы',
      uz: "G'azab va chegaralar",
    },
    why: {
      ru: 'Трёхшаговый выход из вспышки: дыхание, пауза, называние. Гнев — сигнал о нарушенной границе, и говорить о том, что не нравится, надо прямо.',
      uz: "Portlashdan uch qadamli chiqish: nafas, pauza, nomlash. G'azab — buzilgan chegara haqidagi signal, va nima yoqmasligini to'g'ridan-to'g'ri aytish kerak.",
    },
    rhythm: 'principle',
    videos: ['018'],
  },
  {
    key: 'mind-otdelyat-sebya-ot-svoih-idey',
    title: {
      ru: 'Отделять себя от своих идей',
      uz: "O'zingizni g'oyalaringizdan ajrating",
    },
    why: {
      ru: 'Критика идеи — не критика вас. Отсюда же — пространство безопасности для команды и прямой запрос обратной связи.',
      uz: "G'oyani tanqid qilish — sizni tanqid qilish emas. Shu yerdan — jamoa uchun xavfsizlik maydoni va teskari aloqani to'g'ridan-to'g'ri so'rash.",
    },
    rhythm: 'principle',
    videos: ['018'],
  },
  {
    key: 'mind-dengi-investitsii-protiv-trat',
    title: {
      ru: 'Деньги: инвестиции против трат',
      uz: "Pul: investitsiya va xarajat",
    },
    why: {
      ru: 'Различать расходы и инвестиции, закладывать бюджет на развитие заранее, разложить все статьи, не забирать всю прибыль из дела и делить результат с командой.',
      uz: "Xarajat bilan investitsiyani farqlang, rivojlanish byudjetini oldindan ajrating, barcha moddalarni yoyib chiqing, foydaning hammasini ishdan olmang va natijani jamoa bilan bo'ling.",
    },
    rhythm: 'principle',
    videos: ['018'],
  },
  {
    key: 'mind-harizma',
    title: {
      ru: 'Харизма',
      uz: "Xarizma",
    },
    why: {
      ru: 'Разобрана как структура, а не дар: внешность весит мало, состояние — много. Начинать со своего состояния, потому что эмоции передаются; проверить, верите ли вы в то, что делаете; написать пять конкретных достижений и научиться рассказывать…',
      uz: "Sovg'a emas, tuzilma sifatida ko'rib chiqilgan: tashqi ko'rinish kam, holat ko'p og'irlik qiladi. O'z holatingizdan boshlang, chunki hissiyot yuqadi; qilayotgan ishingizga ishonasizmi — tekshiring; beshta aniq yutuqni yozib, ularni aytishni o'rganing.",
    },
    rhythm: 'principle',
    videos: ['027'],
  },
  {
    key: 'mind-tri-rezhima-myshleniya',
    title: {
      ru: 'Три режима мышления',
      uz: "Uch tafakkur rejimi",
    },
    why: {
      ru: 'Дельный, тревожный, творческий. Канал советует не искать золотую середину, а переключаться намеренно: в поиске возможностей настраиваться на выигрыш, в тревожном режиме придираться адресно, разбирая задачу тремя проходами подряд.',
      uz: "Ishchan, xavotirli, ijodiy. Kanal oltin o'rtalikni izlamay, ataylab almashishni maslahat beradi: imkoniyat izlashda yutuqqa sozlaning, xavotirli rejimda manzilli e'tiroz bildiring, vazifani ketma-ket uch o'tishda ko'rib chiqing.",
    },
    rhythm: 'principle',
    videos: ['001'],
  },
  {
    key: 'mind-zaschitnyy-pessimizm-protiv-toksichnogo-pozitiva',
    title: {
      ru: 'Защитный пессимизм против токсичного позитива',
      uz: "Himoya pessimizmi toksik pozitivga qarshi",
    },
    why: {
      ru: 'Заранее продумать, что может пойти не так, — рабочая стратегия. Отличие защитного пессимизма от токсичного — наличие действия.',
      uz: "Nima noto'g'ri ketishi mumkinligini oldindan o'ylab qo'yish — ishlaydigan strategiya. Himoya pessimizmining toksigidan farqi — harakatning borligi.",
    },
    rhythm: 'principle',
    videos: ['001'],
  },
  {
    key: 'mind-proveryat-seychas-ne-vremya',
    title: {
      ru: 'Проверять «сейчас не время»',
      uz: "«Hozir vaqti emas» ni tekshiring",
    },
    why: {
      ru: 'Аргумент об отсрочке чаще всего маскирует страх. Отслеживать момент, когда голова его подсовывает.',
      uz: "Kechiktirish dalili ko'pincha qo'rquvni yashiradi. Bosh uni surib qo'ygan paytni kuzating.",
    },
    rhythm: 'principle',
    videos: ['001', '010'],
  },
  {
    key: 'mind-vybirat-otnoshenie-tam-gde-ne-vliyaesh',
    title: {
      ru: 'Выбирать отношение там, где не влияешь',
      uz: "Ta'sir qila olmagan joyda munosabatni tanlang",
    },
    why: {
      ru: 'И искать минимальный рычаг даже в неуправляемой ситуации.',
      uz: "Va boshqarib bo'lmaydigan vaziyatda ham eng kichik richagni izlang.",
    },
    rhythm: 'principle',
    videos: ['001'],
  },
  {
    key: 'mind-hochu-i-nado',
    title: {
      ru: '«Хочу» и «надо»',
      uz: "«Xohlayman» va «kerak»",
    },
    why: {
      ru: 'Упражнение с тремя столбцами — надо, хочу, совпадения — и три стратегии работы с «надо»: переформулировать через «хочу», найти собственный смысл, отказаться.',
      uz: "Uch ustunli mashq — kerak, xohlayman, mos kelganlari — va «kerak» bilan ishlashning uch strategiyasi: «xohlayman» orqali qayta ta'riflash, o'z ma'nosini topish, voz kechish.",
    },
    rhythm: 'principle',
    videos: ['035'],
  },
  {
    key: 'mind-destruktivnye-ustanovki-i-vyuchennaya-bespomoschnost',
    title: {
      ru: 'Деструктивные установки и выученная беспомощность',
      uz: "Buzuvchi qarashlar va o'rganilgan nochorlik",
    },
    why: {
      ru: 'Шесть установок опознаются по фразам-маркерам. Выученная беспомощность лечится малыми победами, а сравнивать себя надо с собой вчерашним.',
      uz: "Oltita qarash belgi-iboralari bo'yicha tanib olinadi. O'rganilgan nochorlik kichik g'alabalar bilan davolanadi, o'zingizni esa kechagi o'zingiz bilan solishtirish kerak.",
    },
    rhythm: 'principle',
    videos: ['035'],
  },
  {
    key: 'mind-prozhivat-emotsii-i-ne-pokupat-status',
    title: {
      ru: 'Проживать эмоции и не покупать статус',
      uz: "Hissiyotni yashab o'ting va maqom sotib olmang",
    },
    why: {
      ru: 'Эмоцию, которую не прожили, обычно заедают покупкой. Вещь остаётся, причина тоже.',
      uz: "Yashab o'tilmagan hissiyot odatda xarid bilan bosiladi. Narsa qoladi, sabab ham.",
    },
    rhythm: 'principle',
    videos: ['035'],
  },
  {
    key: 'mind-uprazhnenie-s-dvumya-treylerami',
    title: {
      ru: 'Упражнение с двумя трейлерами',
      uz: "Ikki treyler mashqi",
    },
    why: {
      ru: 'Представить два фильма о своей жизни — при нынешнем курсе и при желаемом. И не ждать идеального баланса: задача — не равновесие, а осознанный выбор.',
      uz: "O'z hayotingiz haqida ikki film tasavvur qiling — hozirgi yo'nalishda va istagan yo'nalishda. Va ideal muvozanat kutmang: vazifa muvozanat emas, ongli tanlov.",
    },
    rhythm: 'principle',
    videos: ['035'],
  },
  {
    key: 'mind-tehnika-postanovki-tseley-cherez-prepyatstviya',
    title: {
      ru: 'Техника постановки целей через препятствия',
      uz: "To'siqlar orqali maqsad qo'yish usuli",
    },
    why: {
      ru: 'Самая содержательная методика канала по целям, со ссылкой на исследования. Суть: доска желаний не работает, а намеренное сравнение желаемого с нынешним состоянием — работает.',
      uz: "Kanalning maqsadlar bo'yicha eng mazmunli uslubi, tadqiqotlarga havola bilan. Mohiyati: istaklar taxtasi ishlamaydi, istalganni hozirgi holat bilan ataylab solishtirish esa ishlaydi.",
    },
    rhythm: 'principle',
    videos: ['038'],
  },
  {
    key: 'mind-samokontrol-i-dofamin',
    title: {
      ru: 'Самоконтроль и дофамин',
      uz: "O'z-o'zini nazorat va dofamin",
    },
    why: {
      ru: 'Три функции самоконтроля: «я буду», «я не буду», «я хочу». Различение дешёвого и дорогого дофамина: быстрые удовольствия вытесняют медленные, и тяга к ним — признак перегрузки, а не слабости.',
      uz: "O'z-o'zini nazoratning uch vazifasi: «qilaman», «qilmayman», «xohlayman». Arzon va qimmat dofaminni ajratish: tez zavqlar sekinlarini siqib chiqaradi, ularga intilish esa zaiflik emas, ortiqcha yuk belgisi.",
    },
    rhythm: 'principle',
    videos: ['047'],
  },
  {
    key: 'mind-ne-putat-otsenki-so-sposobnostyami',
    title: {
      ru: 'Не путать оценки со способностями',
      uz: "Bahoni qobiliyat bilan aralashtirmang",
    },
    why: {
      ru: 'Школьная успешность не предсказывает деловую. Начинать раньше, чем почувствуете готовность, и выпускать минимально жизнеспособную версию.',
      uz: "Maktabdagi muvaffaqiyat ishdagisini bashorat qilmaydi. Tayyor his qilishdan oldinroq boshlang va eng kichik yashovchan versiyani chiqaring.",
    },
    rhythm: 'principle',
    videos: ['039'],
  },
  {
    key: 'mind-soft-skily-i-emotsionalnyy-intellekt',
    title: {
      ru: 'Софт-скилы и эмоциональный интеллект',
      uz: "Yumshoq ko'nikmalar va hissiy intellekt",
    },
    why: {
      ru: 'Распознавание своих и чужих эмоций, коммуникация, эмпатия. И собирать команду вместо того, чтобы делать всё самому.',
      uz: "O'z va o'zga hissiyotlarini tanib olish, muloqot, empatiya. Va hammasini o'zi qilish o'rniga jamoa yig'ish.",
    },
    rhythm: 'principle',
    videos: ['039'],
  },
  {
    key: 'mind-sprashivat-zachem-a-ne-tolko-kak',
    title: {
      ru: 'Спрашивать «зачем», а не только «как»',
      uz: "«Qanday» dan tashqari «nega» ni ham so'rang",
    },
    why: {
      ru: 'Подвергать сомнению привычное и наращивать терпимость к ошибкам.',
      uz: "Odatiy narsani shubha ostiga oling va xatolarga chidamni oshiring.",
    },
    rhythm: 'principle',
    videos: ['039'],
  },
  {
    key: 'mind-otlichit-krizis-ot-depressii',
    title: {
      ru: 'Отличить кризис от депрессии',
      uz: "Inqirozni depressiyadan ajrating",
    },
    why: {
      ru: 'Критерий отличия назван прямо, приведены семь признаков кризиса и нормативные возрастные кризисы.',
      uz: "Farq mezoni to'g'ridan-to'g'ri aytilgan, inqirozning yetti belgisi va me'yoriy yosh inqirozlari keltirilgan.",
    },
    rhythm: 'principle',
    videos: ['010'],
  },
  {
    key: 'mind-ne-podmenyat-reshenie-otvlecheniem',
    title: {
      ru: 'Не подменять решение отвлечением',
      uz: "Qarorni chalg'ish bilan almashtirmang",
    },
    why: {
      ru: 'Отвлечение работает как обезболивающее при переломе — снимает симптом, не лечит. И решать вовремя, чтобы кризисы не наслаивались.',
      uz: "Chalg'ish singan suyakdagi og'riq qoldiruvchidek ishlaydi — alomatni oladi, davolamaydi. Va inqirozlar bir-birining ustiga chiqmasligi uchun o'z vaqtida hal qiling.",
    },
    rhythm: 'principle',
    videos: ['010'],
  },
  {
    key: 'mind-iskat-istochnik-resursa-a-ne-atributy',
    title: {
      ru: 'Искать источник ресурса, а не атрибуты',
      uz: "Atributni emas, resurs manbaini izlang",
    },
    why: {
      ru: 'За несбыточной мечтой двадцатилетнего обычно стоит подавленная потребность, которую можно закрыть иначе.',
      uz: "Yigirma yoshlining ro'yobga chiqmagan orzusi ortida odatda boshqacha yopish mumkin bo'lgan bosilgan ehtiyoj turadi.",
    },
    rhythm: 'principle',
    videos: ['010'],
  },
  {
    key: 'mind-chetyre-voprosa-zazemleniya',
    title: {
      ru: 'Четыре вопроса заземления',
      uz: "Yerga qaytaruvchi to'rt savol",
    },
    why: {
      ru: 'Что есть, что подконтрольно, чего боюсь, что сделаю. Страхи полезно называть парами.',
      uz: "Nima bor, nima qo'limda, nimadan qo'rqaman, nima qilaman. Qo'rquvlarni juft-juft nomlash foydali.",
    },
    rhythm: 'principle',
    videos: ['010'],
  },
  {
    key: 'mind-proshlyy-opyt-aktiv',
    title: {
      ru: 'Прошлый опыт — актив',
      uz: "O'tmish tajriba — aktiv",
    },
    why: {
      ru: 'Метафора кувшина: опыт накапливается, а не тратится.',
      uz: "Ko'za metaforasi: tajriba sarflanmaydi, to'planadi.",
    },
    rhythm: 'principle',
    videos: ['010'],
  },
  {
    key: 'mind-ruminatsiya',
    title: {
      ru: 'Руминация',
      uz: "Ruminatsiya",
    },
    why: {
      ru: 'Признак — отсутствие продвижения: мысль крутится, решение не появляется. Прерывается физическим действием.',
      uz: "Belgisi — siljishning yo'qligi: fikr aylanadi, yechim paydo bo'lmaydi. Jismoniy harakat bilan uziladi.",
    },
    rhythm: 'principle',
    videos: ['032'],
  },
  {
    key: 'mind-upravlyaemoe-i-neupravlyaemoe',
    title: {
      ru: 'Управляемое и неуправляемое',
      uz: "Boshqariladigan va boshqarilmaydigan",
    },
    why: {
      ru: 'Разделять — и использовать чувствительность к обратной связи как инструмент, а не как помеху.',
      uz: "Ajrating — va teskari aloqaga sezgirlikni xalaqit emas, asbob sifatida ishlating.",
    },
    rhythm: 'principle',
    videos: ['032'],
  },
  {
    key: 'mind-kontrol-stavshiy-trevogoy',
    title: {
      ru: 'Контроль, ставший тревогой',
      uz: "Xavotirga aylangan nazorat",
    },
    why: {
      ru: 'Отслеживать момент, когда контроль превратился в тревогу. Допускать ошибки подчинённых как часть работы — прямо связано с делегированием из 06.',
      uz: "Nazorat xavotirga aylangan paytni kuzating. Bo'ysunuvchilarning xatosini ishning bir qismi sifatida qabul qiling — bu 06-dagi topshirish bilan to'g'ridan-to'g'ri bog'liq.",
    },
    rhythm: 'principle',
    videos: ['032'],
  },
  {
    key: 'mind-bazovye-usloviya-i-spetsialist',
    title: {
      ru: 'Базовые условия и специалист',
      uz: "Asosiy shartlar va mutaxassis",
    },
    why: {
      ru: 'Сон, питание, движение. Осознанное мышление включается намеренно.',
      uz: "Uyqu, ovqat, harakat. Ongli tafakkur ataylab yoqiladi.",
    },
    rhythm: 'principle',
    videos: ['032'],
  },
  {
    key: 'mind-okruzhenie-kak-resurs',
    title: {
      ru: 'Окружение как ресурс',
      uz: "Atrof-muhit — resurs",
    },
    why: {
      ru: 'Три вида дружбы по Аристотелю и круги близости с ограничением числа устойчивых связей. Практическое: сократить общение с обесценивающими и держать рядом хотя бы одного мечтателя.',
      uz: "Aristotel bo'yicha do'stlikning uch turi va barqaror aloqalar soni cheklangan yaqinlik doiralari. Amaliysi: qadrsizlantiruvchilar bilan muloqotni qisqartiring va yonda hech bo'lmasa bitta orzumandni tuting.",
    },
    rhythm: 'principle',
    videos: ['005'],
  },
  {
    key: 'mind-slabye-svyazi',
    title: {
      ru: 'Слабые связи',
      uz: "Zaif aloqalar",
    },
    why: {
      ru: 'Новое и выгодное приходит от дальних знакомых чаще, чем от близких: они находятся в других кругах и знают то, чего не знаете вы.',
      uz: "Yangi va foydali narsa yaqinlardan ko'ra uzoq tanishlardan ko'proq keladi: ular boshqa doiralarda va siz bilmagan narsani biladi.",
    },
    rhythm: 'principle',
    videos: ['005'],
  },
  {
    key: 'mind-druzhba-trebuet-usiliya',
    title: {
      ru: 'Дружба требует усилия',
      uz: "Do'stlik kuch talab qiladi",
    },
    why: {
      ru: 'После университета связи не поддерживаются сами. Действовать первым и не вести счёт.',
      uz: "Universitetdan keyin aloqalar o'zi saqlanmaydi. Birinchi bo'lib harakat qiling va hisob yuritmang.",
    },
    rhythm: 'principle',
    videos: ['005'],
  },
  {
    key: 'mind-nachinat-znakomstvo-s-prosby',
    title: {
      ru: 'Начинать знакомство с просьбы',
      uz: "Tanishuvni iltimosdan boshlang",
    },
    why: {
      ru: 'Небольшая просьба сближает быстрее услуги. И не пытаться произвести впечатление — это считывается.',
      uz: "Kichik iltimos xizmatdan tezroq yaqinlashtiradi. Va taassurot qoldirishga urinmang — bu sezilib qoladi.",
    },
    rhythm: 'principle',
    videos: ['005'],
  },
  {
    key: 'mind-ne-brat-blizkogo-druga-v-partnery',
    title: {
      ru: 'Не брать близкого друга в партнёры',
      uz: "Yaqin do'stni sherik qilmang",
    },
    why: {
      ru: 'Партнёр должен дополнять, а не дублировать — см. 06.',
      uz: "Sherik to'ldirishi kerak, takrorlashi emas — qarang 06.",
    },
    rhythm: 'principle',
    videos: ['005'],
  },
  {
    key: 'mind-odinochestvo-faktor-zdorovya',
    title: {
      ru: 'Одиночество — фактор здоровья',
      uz: "Yolg'izlik — salomatlik omili",
    },
    why: {
      ru: 'Приводятся оценки влияния социальных связей на здоровье и продолжительность жизни. Для человека, работающего в одиночку с ежедневным циклом, это не абстракция.',
      uz: "Ijtimoiy aloqalarning salomatlik va umr uzunligiga ta'siri baholari keltiriladi. Kundalik sikl bilan yolg'iz ishlayotgan odam uchun bu mavhumlik emas.",
    },
    rhythm: 'principle',
    videos: ['005'],
  },
  {
    key: 'mind-dengi-i-schaste',
    title: {
      ru: 'Деньги и счастье',
      uz: "Pul va baxt",
    },
    why: {
      ru: 'Синдром отложенной жизни, привыкание к достигнутому, эволюционный перекос внимания к негативу.',
      uz: "Kechiktirilgan hayot sindromi, erishilganiga ko'nikish, diqqatning salbiyga evolyutsion og'ishi.",
    },
    rhythm: 'principle',
    videos: ['021'],
  },
  {
    key: 'mind-chitat-po-zaprosu',
    title: {
      ru: 'Читать по запросу',
      uz: "So'rov bo'yicha o'qing",
    },
    why: {
      ru: 'Брать книгу под конкретную задачу, а не подряд. И не ждать подходящего момента.',
      uz: "Kitobni ketma-ket emas, aniq vazifa ostida oling. Va mos paytni kutmang.",
    },
    rhythm: 'principle',
    videos: ['076'],
  },
  {
    key: 'mind-chto-kanal-rekomenduet',
    title: {
      ru: 'Что канал рекомендует',
      uz: "Kanal nimani tavsiya qiladi",
    },
    why: {
      ru: 'Три книги: о запуске дела без лишних жертв, классический учебник маркетинга, книга о работе с постоянными клиентами.',
      uz: "Uch kitob: ortiqcha qurbonsiz ish boshlash haqida, klassik marketing darsligi, doimiy mijozlar bilan ishlash haqidagi kitob.",
    },
    rhythm: 'principle',
    videos: ['076'],
  },
  {
    key: 'mind-testovyy-zapusk-vmesto-polnoy-sborki',
    title: {
      ru: 'Тестовый запуск вместо полной сборки',
      uz: "To'liq yig'ish o'rniga sinov ishga tushirish",
    },
    why: {
      ru: 'Проверить отклик до полной реализации, не расписывать план на годы.',
      uz: "To'liq amalga oshirishdan oldin javobni tekshiring, rejani yillarga yozmang.",
    },
    rhythm: 'principle',
    videos: ['076'],
  },
  {
    key: 'mind-marketing-eto-vse',
    title: {
      ru: 'Маркетинг — это всё',
      uz: "Marketing — bu hamma narsa",
    },
    why: {
      ru: 'Любое касание клиента с вами — маркетинг: упаковка, тон сообщения, чистота ящика для доставки.',
      uz: "Mijozning siz bilan har qanday tegishi — marketing: qadoq, xabar ohangi, yetkazish qutisining tozaligi.",
    },
    rhythm: 'principle',
    videos: ['076'],
  },
  {
    key: 'mind-davat-nemnogo-bolshe-obeschannogo',
    title: {
      ru: 'Давать немного больше обещанного',
      uz: "Va'da qilganingizdan sal ko'proq bering",
    },
    why: {
      ru: 'И закладывать запас в сроки, чтобы это было возможно. Для вас — привезти чуть больше грамм, чем в заказе, стоит копейки и запоминается.',
      uz: "Va buning iloji bo'lishi uchun muddatga zaxira qo'ying. Siz uchun — buyurtmadagidan sal ko'proq gramm olib borish tiyinga tushadi va esda qoladi.",
    },
    rhythm: 'principle',
    videos: ['076'],
  },
  {
    key: 'mind-prodavat-polzu-a-ne-tovar',
    title: {
      ru: 'Продавать пользу, а не товар',
      uz: "Mahsulotni emas, foydani soting",
    },
    why: {
      ru: 'Классическая формула про дрель и дырку в стене. Шефу нужна не микрозелень, а подача, которая выделяет блюдо.',
      uz: "Parma va devordagi teshik haqidagi klassik formula. Oshpazga mikroko'kat emas, taomni ajratib turadigan taqdimot kerak.",
    },
    rhythm: 'principle',
    videos: ['076'],
  },
];
