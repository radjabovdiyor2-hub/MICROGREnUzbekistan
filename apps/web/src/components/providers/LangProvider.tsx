'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type Lang = 'uz' | 'ru';

// ==========================================
// Translations dictionary
// ==========================================
const translations: Record<string, Record<Lang, string>> = {
  // === Navigation ===
  'nav.home': { uz: 'Asosiy', ru: 'Главная' },
  'nav.catalog': { uz: 'Katalog', ru: 'Каталог' },
  'nav.cart': { uz: 'Savat', ru: 'Корзина' },
  'nav.favorites': { uz: 'Sevimli', ru: 'Избранное' },
  'nav.magazine': { uz: 'Jurnal', ru: 'Журнал' },
  'nav.profile': { uz: 'Profil', ru: 'Профиль' },

  // === Hero Section ===
  'hero.badge': { uz: "Sog'lom Hayot", ru: 'Здоровая Жизнь' },
  'hero.title1': { uz: 'Sog`lom hayot va ZOJ', ru: 'Здоровье и ЗОЖ: Свежая еда' },
  'hero.title2': { uz: "mikroko'katlar, gullar va ko'katlar", ru: 'микрозелень, зелень и цветы' },
  'hero.subtitle': { uz: 'Eng sarxil mikroko`katlar, restoranlar uchun ko`katlar, gullar va gidroponika — hammasi bir joyda.', ru: 'Органическая еда: свежая микрозелень, зелень, съедобные цветы и семена. Идеально для ресторанов и здорового образа жизни (ЗОЖ).' },
  'hero.catalog_btn': { uz: "Katalogga o'tish", ru: 'Перейти в каталог' },
  'hero.contact_btn': { uz: "Bog'lanish", ru: 'Связаться' },
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
  'cart.payment_methods': { uz: 'Click · Payme · Naqd pul', ru: 'Click · Payme · Наличные' },

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

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('uz');

  useEffect(() => {
    const stored = localStorage.getItem('Microgreen-lang') as Lang | null;
    if (stored && (stored === 'uz' || stored === 'ru')) {
      setLangState(stored);
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem('Microgreen-lang', l);
  }, []);

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
