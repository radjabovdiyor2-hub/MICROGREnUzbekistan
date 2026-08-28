'use client';

import {
  Route,
  Activity, Banknote, BarChart, Brain, Camera, ClipboardList, Clock, Cpu, CreditCard, Eye, FileText, History, Layers, Leaf, Lightbulb, Lock, Package, Percent, Play, ShoppingCart, Compass, Sprout, BookOpen, Navigation, Tag, TrendingUp, Truck, Users, Wallet, Network
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Реестр вкладок админки — чистые данные, вынесены из AdminShell.
//
// РАЗДЕЛ СОБИРАЕТСЯ ПО ВОПРОСУ, А НЕ ПО ТЕХНОЛОГИИ. Прежняя раскладка
// разводила по разным разделам вещи, между которыми ходят подряд: доход
// лежал в «Главном», а аналитика и прогноз — в «Системе», рядом с
// настройками; задачи отделам — в «ИИ-офисе», а сотрудники — в «Команде».
// Порядок в меню должен повторять порядок работы, иначе меню приходится
// перечитывать целиком каждый раз.
//
// ЧТО СВЁРНУТО И ПОЧЕМУ:
//
//   · Десять отделов были десятью пунктами при ОДНОМ компоненте с разным
//     идентификатором — пятая часть меню на один экран. Теперь один пункт
//     «Отделы» с переключателем внутри.
//
//   · «Сводка» и «Доход» читали один раздел аналитики и отвечали на один
//     вопрос, различаясь горизонтом: сутки против недели. Сведены в один
//     экран — сегодня сверху, период ниже.
//
// Названия внутри меню больше не повторяются: «Продажи» осталось только у
// кассы, отдел продаж живёт внутри «Отделов»; «Финансы» — только у денег;
// «Аналитика» — только у отчётов.
// ══════════════════════════════════════════════════════════════════════

export const TAB_GROUPS = [
  {
    // Утро владельца: ИИ-помощник, свои практики, касса и деньги за день.
    title: { ru: 'Главное', uz: 'Asosiy' },
    tabs: [
      { id: 'stepan', ru: 'Стёпан (ИИ)', uz: 'Stepan (AI)', icon: <Brain size={16} /> },
      // Владелец — про человека, а не про товар: приоритеты, состояние,
      // личные деньги, решения. В «Главном», потому что открывают утром.
      { id: 'owner', ru: 'Владелец', uz: 'Egasi', icon: <Compass size={16} /> },
      { id: 'pos', ru: 'Продажи (касса)', uz: 'Sotish (kassa)', icon: <ShoppingCart size={16} /> },
      { id: 'stats', ru: 'Сводка', uz: 'Svodka', icon: <BarChart size={16} /> },
    ]
  },
  {
    // Деньги в одном месте: приход, долги, расход на ИИ и отчёты по ним.
    title: { ru: 'Деньги', uz: 'Pul' },
    tabs: [
      { id: 'finance', ru: 'Финансы', uz: 'Moliya', icon: <Wallet size={16} /> },
      { id: 'debts', ru: 'Долги', uz: 'Qarzlar', icon: <CreditCard size={16} /> },
      { id: 'analytics', ru: 'Аналитика', uz: 'Analitika', icon: <BarChart size={16} /> },
      { id: 'forecast', ru: 'Прогноз', uz: 'Prognoz', icon: <TrendingUp size={16} /> },
      { id: 'ai_spend', ru: 'Расходы ИИ', uz: 'AI xarajatlari', icon: <Cpu size={16} /> },
    ]
  },
  {
    // Путь заказа: кто купил, что заказал, как доехало.
    title: { ru: 'Клиенты и заказы', uz: 'Mijozlar va buyurtmalar' },
    tabs: [
      { id: 'customers', ru: 'Клиенты', uz: 'Mijozlar', icon: <Users size={16} /> },
      { id: 'orders', ru: 'Заказы', uz: 'Buyurtmalar', icon: <Truck size={16} /> },
      { id: 'deliveries', ru: 'Логистика', uz: 'Logistika', icon: <Truck size={16} /> },
      // Рейс глазами того, кто его едет. Владельцу тоже открыт: иначе
      // проверить, что видит курьер, можно было бы только его телефоном.
      { id: 'my_route', ru: 'Мой рейс', uz: 'Mening reysim', icon: <Navigation size={16} /> },
      { id: 'visit_plans', ru: 'Объезды за день', uz: 'Kunlik yoʻnalishlar', icon: <Route size={16} /> },
      { id: 'promo', ru: 'Промокоды', uz: 'Promokodlar', icon: <Percent size={16} /> },
    ]
  },
  {
    // Что продаём и что для этого лежит на складе.
    title: { ru: 'Товар и склад', uz: 'Mahsulot va ombor' },
    tabs: [
      { id: 'products', ru: 'Товары', uz: 'Mahsulotlar', icon: <Tag size={16} /> },
      { id: 'categories', ru: 'Категории', uz: 'Kategoriyalar', icon: <Layers size={16} /> },
      { id: 'inventory', ru: 'Склад', uz: 'Ombor', icon: <Package size={16} /> },
      // Сырьё — отдельно от готового товара: оно расходуется граммами и
      // имеет только себестоимость, а не цену продажи.
      { id: 'raw_materials', ru: 'Сырьё', uz: 'Xomashyo', icon: <Sprout size={16} /> },
      { id: 'movements', ru: 'Движения', uz: 'Harakatlar', icon: <ClipboardList size={16} /> },
      { id: 'suppliers', ru: 'Поставщики', uz: 'Yetkazuvchilar', icon: <Truck size={16} /> },
    ]
  },
  {
    // Теплица: от нормы высева до контроля качества и опытов.
    title: { ru: 'Производство', uz: 'Ishlab chiqarish' },
    tabs: [
      { id: 'growing', ru: 'Посадки', uz: 'Ekish', icon: <Leaf size={16} /> },
      // Нормы расхода: по ним посадка списывает сырьё и считает себестоимость.
      // Сидер справочника прямо отсылает владельца сюда, а экрана не было.
      { id: 'crop_norms', ru: 'Нормы культур', uz: 'Ekin normalari', icon: <Sprout size={16} /> },
      { id: 'qa', ru: 'Контроль качества', uz: 'Sifat nazorati', icon: <Eye size={16} /> },
      { id: 'experiments', ru: 'Опыты (R&D)', uz: 'Tajribalar (R&D)', icon: <Lightbulb size={16} /> },
    ]
  },
  {
    // Люди: свои сотрудники и то, что им поручено.
    title: { ru: 'Команда', uz: 'Jamoa' },
    tabs: [
      { id: 'employees', ru: 'Сотрудники', uz: 'Xodimlar', icon: <Users size={16} /> },
      { id: 'shifts', ru: 'График смен', uz: 'Smena jadvali', icon: <Clock size={16} /> },
      { id: 'tasks', ru: 'Задачи отделам', uz: 'Vazifalar', icon: <ClipboardList size={16} /> },
      { id: 'approvals', ru: 'Ждёт решения', uz: 'Qaror kutmoqda', icon: <Clock size={16} /> },
    ]
  },
  {
    // ИИ-офис: боты, их отделы, процессы и обучение.
    title: { ru: 'ИИ-офис', uz: 'AI ofis' },
    tabs: [
      // Один пункт вместо десяти: за всеми отделами стоял один экран с
      // разным идентификатором, переключатель теперь внутри.
      { id: 'departments', ru: 'Отделы', uz: "Bo'limlar", icon: <Network size={16} /> },
      { id: 'bot_control', ru: 'Пульт ИИ', uz: 'AI Pult', icon: <Play size={16} /> },
      { id: 'bot_health', ru: 'Здоровье ботов', uz: 'Botlar holati', icon: <Activity size={16} /> },
      { id: 'workflow_studio', ru: 'Процессы (DAG)', uz: 'Jarayonlar (DAG)', icon: <Network size={16} /> },
      { id: 'learnings', ru: 'Обучение ИИ', uz: "AI O'rgatish", icon: <Brain size={16} /> },
    ]
  },
  {
    title: { ru: 'Журнал FRESH WEEKLY', uz: 'FRESH WEEKLY jurnali' },
    tabs: [
      { id: 'magazine', ru: 'Журнал', uz: 'Jurnal', icon: <FileText size={16} /> },
      // Выпусками журнал не управлялся вовсе: восемь групп API без
      // единого экрана, всё делал крон, а владелец узнавал результат из
      // готового PDF.
      { id: 'magazine_editions', ru: 'Выпуски', uz: 'Sonlar', icon: <BookOpen size={16} /> },
      // Подписки на тираж, счета за печать и рекламодатели: три группы
      // API без единого экрана. Печать — прямой расход, реклама и
      // подписка — прямая выручка, а увидеть их было негде.
      { id: 'magazine_money', ru: 'Тираж и реклама', uz: 'Tiraj va reklama', icon: <Banknote size={16} /> },
      { id: 'guest_photos', ru: 'Кадры гостей', uz: 'Mehmon kadrlari', icon: <Camera size={16} /> },
      { id: 'recipes', ru: 'Рецепты', uz: 'Retseptlar', icon: <Leaf size={16} /> },
    ]
  },
  {
    title: { ru: 'Система', uz: 'Tizim' },
    tabs: [
      { id: 'audit', ru: 'Журнал действий', uz: 'Amallar jurnali', icon: <History size={16} /> },
      { id: 'settings', ru: 'Настройки', uz: 'Sozlamalar', icon: <Lock size={16} /> },
      { id: 'franchise', ru: 'Франшиза', uz: 'Franshiza', icon: <Network size={16} /> },
    ]
  }
];

/** Плоский список для палитры команд (Cmd+K). */
export const ALL_TABS = TAB_GROUPS.flatMap(g =>
  g.tabs.map(tab => ({ ...tab, group: g.title }))
);

export const SELLER_TABS = [
  { id: 'pos', ru: 'Продажи (касса)', uz: 'Sotish (kassa)', icon: <ShoppingCart size={16} /> },
  // Клиенты и карта: продавец по ним ездит. Правка бонусов, статуса и
  // удаление карточек ему закрыты — и в интерфейсе, и в API.
  { id: 'customers', ru: 'Клиенты', uz: 'Mijozlar', icon: <Users size={16} /> },
  // Развозит тот же человек. Маршрут ему назначает владелец, а закрывает
  // точки он сам — до этого отметить доставку было нечем вовсе.
  { id: 'my_route', ru: 'Мой рейс', uz: 'Mening reysim', icon: <Navigation size={16} /> },
];

/** Агроном ведёт теплицу: посадки и ничего больше. Касса ему не нужна. */
export const GROWER_TABS = [
  { id: 'growing', ru: 'Посадки', uz: 'Ekish', icon: <Leaf size={16} /> },
];

/** Вкладки сотрудника по его должности. Владелец сюда не попадает — у него все. */
export function staffTabsFor(role: 'SELLER' | 'GROWER' | null) {
  return role === 'GROWER' ? GROWER_TABS : SELLER_TABS;
}
