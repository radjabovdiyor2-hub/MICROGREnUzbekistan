'use client';

import React, { createContext, useContext, useCallback } from 'react';
import { usePersistentState } from '@/lib/persistentState';

export type Lang = 'uz' | 'ru';

// ==========================================
// Translations dictionary
// ==========================================
/**
 * Словарь интерфейса.
 *
 * Экспортируется РАДИ ПРОВЕРКИ, а не ради чужих импортов: `langDictionary.
 * test.ts` сверяет, что у каждого ключа заполнены оба языка и что русская
 * строка не лежит в узбекской ячейке. Без этого расхождение пары
 * замечается только глазами носителя — а именно так на первом экране и
 * прожили две версии заголовка, говорившие разное.
 */
export const translations: Record<string, Record<Lang, string>> = {
  // === Navigation ===
  'nav.home': { uz: 'Asosiy', ru: 'Главная' },
  'nav.catalog': { uz: 'Katalog', ru: 'Каталог' },
  'nav.cart': { uz: 'Savat', ru: 'Корзина' },
  'nav.favorites': { uz: 'Sevimli', ru: 'Избранное' },
  'nav.magazine': { uz: 'Jurnal', ru: 'Журнал' },
  'nav.profile': { uz: 'Profil', ru: 'Профиль' },

  // === Hero Section ===
  //
  // ОДНО ПРЕДЛОЖЕНИЕ, А НЕ ПЕРЕЧЕНЬ. Здесь стояло «Здоровье и ЗОЖ:
  // свежая еда / микрозелень, зелень и цветы», а в подзаголовке к ним
  // добавлялись съедобные цветы, семена и гидропоника. Пять разных
  // обещаний на первом экране не складываются в одно: посетитель не
  // понимает, что именно ему предлагают и кому это.
  //
  // Осталось то, что мы правда продаём и кому: свежая микрозелень и
  // салаты, дом и рестораны, Самарканд. Город назван намеренно —
  // доставка за 30–90 минут работает только в нём, и человек из другого
  // города должен узнать это на первом экране, а не в корзине.
  //
  // РУССКАЯ И УЗБЕКСКАЯ ВЕРСИИ — ПАРА. Прежние переводами друг друга не
  // были: узбекская говорила про ЗОЖ и гидропонику, русская — про
  // органическую еду и семена. Сверяет их `heroCopy.test.ts`.
  //
  // Апостроф везде `'`, а не обратная кавычка. В прежних строках
  // соседствовали два написания одного апострофа в соседних строках.
  'hero.badge': { uz: 'Samarqand · yangi hosil', ru: 'Самарканд · свежий срез' },
  'hero.title1': { uz: "Yangi mikroko'kat va salatlar", ru: 'Свежая микрозелень и салаты' },
  'hero.title2': { uz: 'uy va restoranlar uchun', ru: 'для дома и ресторанов' },
  'hero.subtitle': { uz: "Buyurtma kuni kesamiz va Samarqand bo'ylab 30–90 daqiqada yetkazamiz.", ru: 'Срезаем в день заказа и привозим по Самарканду за 30–90 минут.' },
  'hero.catalog_btn': { uz: "Ko'kat tanlash", ru: 'Выбрать зелень' },
  // Вела на `tel:`, хотя телефон есть и в шапке, и в подвале, и в блоке
  // контактов. На страницу ресторанов при этом не вело ничего, кроме
  // ссылки в подвале, — а это половина выручки.
  'hero.contact_btn': { uz: 'Restoranlar uchun', ru: 'Для ресторанов' },
  'hero.products_count': { uz: 'Har kuni yangi hosil', ru: 'Свежий урожай каждый день' },
  'hero.delivery': { uz: 'Bugun yetkazib beramiz', ru: 'Доставка сегодня' },
  'hero.prices': { uz: 'Fermer narxlari', ru: 'Цены от фермы' },

  // === Search ===
  'search.placeholder': { uz: 'Qidirish...', ru: 'Поиск...' },

  // === Product Card ===
  'product.add_to_cart': { uz: 'Savatga', ru: 'В корзину' },
  'product.currency': { uz: "so'm", ru: 'сум' },

  // === Cart Page ===
  'cart.title': { uz: 'Savat', ru: 'Корзина' },
  'cart.empty': { uz: "Savat bo'sh", ru: 'Корзина пуста' },
  'cart.empty_desc': { uz: "Katalogdan mahsulotlarni qo'shing", ru: 'Добавьте товары из каталога' },
  'cart.go_catalog': { uz: "Katalogga o'tish", ru: 'Перейти в каталог' },
  'cart.order': { uz: 'Buyurtma', ru: 'Заказ' },
  'cart.items_count': { uz: 'dona', ru: 'шт' },
  'cart.products': { uz: 'Mahsulotlar', ru: 'Товары' },
  'cart.delivery': { uz: 'Yetkazish', ru: 'Доставка' },
  'cart.delivery_free': { uz: 'Bepul!', ru: 'Бесплатно!' },
  'cart.delivery_hint': { uz: "so'm — bepul yetkazish!", ru: 'сум — бесплатная доставка!' },
  'cart.total': { uz: 'Jami', ru: 'Итого' },
  'cart.checkout': { uz: 'Buyurtma berish', ru: 'Оформить заказ' },
  'cart.payment_methods': { uz: "Naqd pul · Karta · O'tkazma", ru: 'Наличные · Карта · Перевод' },

  // === Checkout ===
  'checkout.title': { uz: 'Buyurtma rasmiylashtirish', ru: 'Оформление заказа' },
  'checkout.back': { uz: 'Savatga qaytish', ru: 'Вернуться в корзину' },
  'checkout.personal': { uz: "Shaxsiy ma'lumotlar", ru: 'Личные данные' },
  'checkout.name': { uz: 'Ism', ru: 'Имя' },
  'checkout.name_placeholder': { uz: 'Ismingizni kiriting', ru: 'Введите ваше имя' },
  'checkout.name_error': { uz: 'Ism kiritilmadi', ru: 'Введите имя' },
  'checkout.phone': { uz: 'Telefon', ru: 'Телефон' },
  'checkout.phone_error': { uz: "Telefon raqam noto'g'ri", ru: 'Неверный номер' },
  'checkout.address_title': { uz: 'Yetkazish manzili', ru: 'Адрес доставки' },
  'checkout.address': { uz: 'Manzil', ru: 'Адрес' },
  'checkout.address_placeholder': { uz: "Ko'cha, uy raqami, kvartira...", ru: 'Улица, дом, квартира...' },
  'checkout.address_error': { uz: 'Manzil kiritilmadi', ru: 'Введите адрес' },
  'checkout.note': { uz: 'Izoh (ixtiyoriy)', ru: 'Примечание (необязательно)' },
  'checkout.note_placeholder': { uz: 'Masalan: 2-qavatga olib chiqing', ru: 'Например: поднять на 2 этаж' },
  'checkout.payment': { uz: "To'lov usuli", ru: 'Способ оплаты' },
  'checkout.submit': { uz: 'Buyurtmani tasdiqlash', ru: 'Подтвердить заказ' },
  'checkout.submitting': { uz: 'Yuborilmoqda...', ru: 'Отправляется...' },
  'checkout.error': { uz: 'Xatolik yuz berdi', ru: 'Произошла ошибка' },

  // === Payment Methods ===
  'pay.cash': { uz: 'Naqd pul', ru: 'Наличные' },
  'pay.cash_desc': { uz: "Yetkazib berishda to'lang", ru: 'Оплата при доставке' },
  'pay.click': { uz: 'Click', ru: 'Click' },
  'pay.click_desc': { uz: 'Click ilovasi orqali', ru: 'Через приложение Click' },
  'pay.payme': { uz: 'Payme', ru: 'Payme' },
  'pay.payme_desc': { uz: 'Payme ilovasi orqali', ru: 'Через приложение Payme' },

  // === Order Success ===
  'order.success': { uz: 'Buyurtma qabul qilindi!', ru: 'Заказ принят!' },
  'order.operator': { uz: "Tez orada operator siz bilan bog'lanadi", ru: 'Оператор свяжется с вами в ближайшее время' },
  'order.confirmed': { uz: 'Tasdiqlandi', ru: 'Подтверждён' },
  'order.home': { uz: 'Bosh sahifa', ru: 'Главная' },
  'order.shop_again': { uz: 'Yana xarid qilish', ru: 'Продолжить покупки' },
  'order.contact': { uz: 'Aloqa', ru: 'Контакты' },

  // === AI Banner ===
  'ai.title': { uz: 'Microgreen Agro', ru: 'Агроном Microgreen' },
  'ai.subtitle': { uz: "Cho'ntak agronomingiz", ru: 'Агроном в кармане' },
  'ai.desc': { uz: "Mikroko'katlar va gidroponika bo'yicha AI maslahatchi. Hosilni hisoblash, kasalliklarni aniqlash — hammasi bir joyda.", ru: 'AI-консультант по микрозелени и гидропонике. Расчёт урожайности, диагностика болезней — всё в одном месте.' },
  'ai.try': { uz: "Sinab ko'ring", ru: 'Попробовать' },
  'ai.calc': { uz: 'Hosil kalkulyatori', ru: 'Калькулятор урожая' },
  'ai.calc_desc': { uz: "Urug', suv va ozuqa — avtomatik hisoblash", ru: 'Семена, вода и питание — автоматический расчёт' },
  'ai.photo': { uz: 'Rasmdan tahlil', ru: 'Анализ по фото' },
  'ai.photo_desc': { uz: 'Muammoni suratga oling — AI aniqlaydi', ru: 'Сфотографируйте проблему — AI определит' },
  'ai.weather': { uz: 'Mikroiqlim', ru: 'Совет по микроклимату' },
  'ai.weather_desc': { uz: "Namlik va harorat balansi", ru: 'Баланс влажности и температуры' },
  'ai.electric': { uz: 'Yoritish (Fito)', ru: 'Фитоосвещение' },
  'ai.electric_desc': { uz: 'Lampa quvvati va rejimi', ru: 'Мощность ламп и режим света' },
  'ai.price': { uz: 'Biznes-reja', ru: 'Бизнес-план' },
  'ai.price_desc': { uz: "Daromad va xarajatlar", ru: 'Расчет доходов и расходов' },
  'ai.bonus': { uz: 'Bonus tizimi', ru: 'Бонусная система' },
  'ai.bonus_desc': { uz: 'Har xariddan 3% bonus oling', ru: 'Получайте 3% бонусов с каждой покупки' },
  'ai.stats.skills': { uz: 'Kasb', ru: 'Навыков' },
  'ai.stats.works': { uz: 'Ishlaydi', ru: 'Работает' },
  'ai.stats.photo': { uz: 'Rasmli', ru: 'С фото' },
  'ai.stats.voice': { uz: 'Ovozli', ru: 'Голосом' },

  // === Referral Banner ===
  'ref.title': { uz: 'Bonus dasturi', ru: 'Бонусная программа' },
  'ref.desc': { uz: "Do'stlaringizni taklif qiling — har xariddan 3% bonus oling.", ru: 'Пригласите друзей — получайте 3% бонусов с каждой покупки.' },
  'ref.get_code': { uz: 'Kodimni olish', ru: 'Получить код' },

  // === Language ===
  'lang.switch': { uz: 'Русский', ru: "O'zbekcha" },

  // === Featured ===
  'featured.title': { uz: 'Ommabop mahsulotlar', ru: 'Популярные товары' },
  'featured.all': { uz: 'Barchasi', ru: 'Все' },

  // === Not Found ===
  'notfound.title': { uz: 'Sahifa topilmadi', ru: 'Страница не найдена' },
  'notfound.home': { uz: 'Bosh sahifa', ru: 'Главная' },
  'notfound.catalog': { uz: 'Katalog', ru: 'Каталог' },
};

// ==========================================
// Context
// ==========================================
interface LangContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (keyOrUz: string, ru?: string) => string;
  toggleLang: () => void;
}

const LangContext = createContext<LangContextType>({
  lang: 'uz',
  setLang: () => {},
  t: (keyOrUz) => keyOrUz,
  toggleLang: () => {},
});

export function useLang() {
  return useContext(LangContext);
}

// Чужая строка в хранилище не должна стать языком: всё, кроме 'ru',
// читается как 'uz'. Эту проверку раньше делал эффект гидрации.
const langCodec = {
  parse: (raw: string): Lang => (raw === 'ru' ? 'ru' : 'uz'),
  serialize: (value: Lang) => value,
};

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = usePersistentState<Lang>('Microgreen-lang', 'uz', langCodec);

  const toggleLang = useCallback(() => {
    setLang(lang === 'uz' ? 'ru' : 'uz');
  }, [lang, setLang]);

  // Supports two formats:
  // t('dict.key') - lookup in translations dictionary
  // t('uzbek text', 'russian text') - inline translations
  const t = useCallback((keyOrUz: string, ru?: string): string => {
    if (ru !== undefined) {
      return lang === 'ru' ? ru : keyOrUz;
    }
    return translations[keyOrUz]?.[lang] || keyOrUz;
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang, t, toggleLang }}>
      {children}
    </LangContext.Provider>
  );
}
