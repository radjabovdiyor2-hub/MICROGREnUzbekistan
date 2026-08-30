'use client';

import dynamic from 'next/dynamic';

// ══════════════════════════════════════════════════════════════════════
// Маршрутизация вкладок админки: какая вкладка — такой экран.
//
// Вынесено из AdminShell: файл перерос 200 строк, и почти половину его
// занимал этот список.
//
// ПОЧЕМУ ЧЕРЕЗ next/dynamic
//
// Все 38 экранов импортировались статически, то есть попадали в ОДИН чанк:
// 121 компонент и около 15 000 строк, включая редактор процессов
// (`@xyflow/react`) и печать чека (`html2canvas`). Владелец, открывший кассу,
// скачивал и разбирал заодно журнал, франшизу и студию workflow — экраны,
// которые он видит раз в месяц. На телефоне по мобильной сети это и есть
// «админка долго открывается».
//
// `ssr: false` здесь осознанно: страница объявлена `force-dynamic`, экраны
// живут за паролем и всё равно грузят данные с клиента — рендерить их на
// сервере значит платить дважды за одну и ту же картинку.
//
// Карта клиентов уже была разделена этим же приёмом изнутри
// (`map/AdminCustomerMap`) — здесь тот же шаблон, но для всего списка.
// ══════════════════════════════════════════════════════════════════════

/** Пока чанк экрана летит по сети. Высота держит место, чтобы не прыгало. */
function TabLoading() {
  return (
    <div
      aria-busy="true"
      style={{
        minHeight: 240,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
        fontSize: 'var(--text-sm)',
      }}
    >
      Загрузка…
    </div>
  );
}

// Настройки повторяются в каждой строке, и это не небрежность: компилятор
// Next читает их СТАТИЧЕСКИ и отвергает вынесенную переменную — «next/dynamic
// options must be an object literal». Обёртка-дженерик тоже не годится: вывод
// типов пропсов идёт от лоадера и через промежуточную функцию схлопывается
// в `never`, после чего экраны перестают принимать собственные пропсы.

const AdminOrders = dynamic(() => import('@/components/admin/AdminOrders').then((m) => m.AdminOrders), { ssr: false, loading: TabLoading });
const AdminProducts = dynamic(() => import('@/components/admin/AdminProducts').then((m) => m.AdminProducts), { ssr: false, loading: TabLoading });
const AdminPOS = dynamic(() => import('@/components/admin/AdminPOS').then((m) => m.AdminPOS), { ssr: false, loading: TabLoading });
const AdminInventory = dynamic(() => import('@/components/admin/AdminInventory').then((m) => m.AdminInventory), { ssr: false, loading: TabLoading });
const AdminDebts = dynamic(() => import('@/components/admin/AdminDebts').then((m) => m.AdminDebts), { ssr: false, loading: TabLoading });
const AdminMovements = dynamic(() => import('@/components/admin/AdminMovements').then((m) => m.AdminMovements), { ssr: false, loading: TabLoading });
const AdminSuppliers = dynamic(() => import('@/components/admin/AdminSuppliers').then((m) => m.AdminSuppliers), { ssr: false, loading: TabLoading });
const AdminEmployees = dynamic(() => import('@/components/admin/AdminEmployees').then((m) => m.AdminEmployees), { ssr: false, loading: TabLoading });
const AdminShifts = dynamic(() => import('@/components/admin/AdminShifts').then((m) => m.AdminShifts), { ssr: false, loading: TabLoading });
const AdminAnalytics = dynamic(() => import('@/components/admin/AdminAnalytics').then((m) => m.AdminAnalytics), { ssr: false, loading: TabLoading });
const AdminForecast = dynamic(() => import('@/components/admin/AdminForecast').then((m) => m.AdminForecast), { ssr: false, loading: TabLoading });
const AdminSettings = dynamic(() => import('@/components/admin/AdminSettings').then((m) => m.AdminSettings), { ssr: false, loading: TabLoading });
const AdminRawMaterials = dynamic(() => import('@/components/admin/AdminRawMaterials').then((m) => m.AdminRawMaterials), { ssr: false, loading: TabLoading });
const AdminMagazine = dynamic(() => import('@/components/admin/AdminMagazine').then((m) => m.AdminMagazine), { ssr: false, loading: TabLoading });
const AdminMagazineIssues = dynamic(() => import('@/components/admin/AdminMagazineIssues').then((m) => m.AdminMagazineIssues), { ssr: false, loading: TabLoading });
const AdminMagazineMoney = dynamic(() => import('@/components/admin/AdminMagazineMoney').then((m) => m.AdminMagazineMoney), { ssr: false, loading: TabLoading });
const AdminGuestPhotos = dynamic(() => import('@/components/admin/AdminGuestPhotos').then((m) => m.AdminGuestPhotos), { ssr: false, loading: TabLoading });
const AdminMagazineContent = dynamic(() => import('@/components/admin/AdminMagazineContent').then((m) => m.AdminMagazineContent), { ssr: false, loading: TabLoading });
const AdminLearnings = dynamic(() => import('@/components/admin/AdminLearnings').then((m) => m.AdminLearnings), { ssr: false, loading: TabLoading });
const AdminCustomers = dynamic(() => import('@/components/admin/AdminCustomers').then((m) => m.AdminCustomers), { ssr: false, loading: TabLoading });
const AdminBotControl = dynamic(() => import('@/components/admin/AdminBotControl').then((m) => m.AdminBotControl), { ssr: false, loading: TabLoading });
const AdminStepan = dynamic(() => import('@/components/admin/AdminStepan').then((m) => m.AdminStepan), { ssr: false, loading: TabLoading });
const AdminOwner = dynamic(() => import('@/components/admin/AdminOwner').then((m) => m.AdminOwner), { ssr: false, loading: TabLoading });
const AdminDepartments = dynamic(() => import('@/components/admin/AdminDepartments').then((m) => m.AdminDepartments), { ssr: false, loading: TabLoading });
const AdminMoneyOverview = dynamic(() => import('@/components/admin/AdminMoneyOverview').then((m) => m.AdminMoneyOverview), { ssr: false, loading: TabLoading });
const AdminBotHealth = dynamic(() => import('@/components/admin/AdminBotHealth').then((m) => m.AdminBotHealth), { ssr: false, loading: TabLoading });
const AdminPromo = dynamic(() => import('@/components/admin/AdminPromo').then((m) => m.AdminPromo), { ssr: false, loading: TabLoading });
const AdminFinance = dynamic(() => import('@/components/admin/AdminFinance').then((m) => m.AdminFinance), { ssr: false, loading: TabLoading });
const AdminAudit = dynamic(() => import('@/components/admin/AdminAudit').then((m) => m.AdminAudit), { ssr: false, loading: TabLoading });
const AdminChannels = dynamic(() => import('@/components/admin/AdminChannels').then((m) => m.AdminChannels), { ssr: false, loading: TabLoading });
const AdminAiSpend = dynamic(() => import('@/components/admin/AdminAiSpend').then((m) => m.AdminAiSpend), { ssr: false, loading: TabLoading });
const AdminApprovals = dynamic(() => import('@/components/admin/AdminApprovals').then((m) => m.AdminApprovals), { ssr: false, loading: TabLoading });
const AdminVisitPlans = dynamic(() => import('@/components/admin/AdminVisitPlans').then((m) => m.AdminVisitPlans), { ssr: false, loading: TabLoading });
const AdminTasks = dynamic(() => import('@/components/admin/AdminTasks').then((m) => m.AdminTasks), { ssr: false, loading: TabLoading });
const AdminCategories = dynamic(() => import('@/components/admin/AdminCategories').then((m) => m.AdminCategories), { ssr: false, loading: TabLoading });
const AdminDeliveries = dynamic(() => import('@/components/admin/AdminDeliveries').then((m) => m.AdminDeliveries), { ssr: false, loading: TabLoading });
const AdminMyRoute = dynamic(() => import('@/components/admin/AdminMyRoute').then((m) => m.AdminMyRoute), { ssr: false, loading: TabLoading });
const AdminFranchise = dynamic(() => import('@/components/admin/AdminFranchise').then((m) => m.AdminFranchise), { ssr: false, loading: TabLoading });
const AdminWorkflowStudio = dynamic(() => import('@/components/admin/AdminWorkflowStudio').then((m) => m.AdminWorkflowStudio), { ssr: false, loading: TabLoading });

export function AdminTabRouter({ activeTab, focus, query, isOwner, canSell, sellerName, lang, t }: {
  activeTab: string;
  /**
   * Запись, ради которой пришли по ссылке из Telegram (`?focus=`).
   *
   * Ссылку строит ИИ-офис (`shared/admin_links.py`) из заявки владельцу:
   * номер задачи или заказа. Экраны, которым выделять нечего, его
   * просто не берут — вкладка всё равно открыта правильная.
   */
  focus: string;
  /** Что положить в поиск раздела при открытии (`?q=`). */
  query?: string;
  isOwner: boolean;
  /** Владелец или продавец — касса. */
  canSell: boolean;
  sellerName: string;
  lang: 'ru' | 'uz';
  t: (ru: string, uz: string) => string;
}) {
  return (
  <main className="admin-main">
    {activeTab === 'pos' && canSell && <AdminPOS sellerName={isOwner ? t('Владелец', 'Egasi') : sellerName} isOwner={isOwner} />}
    {activeTab === 'stepan' && isOwner && <AdminStepan lang={lang} />}
    {activeTab === 'owner' && isOwner && <AdminOwner lang={lang} />}
    {/* Сводка и доход были двумя вкладками на одном разделе аналитики:
        сутки против недели. Экран один, старый адрес `revenue` оставлен
        живым — на него ведут ссылки из Telegram и закладки владельца. */}
    {(activeTab === 'stats' || activeTab === 'revenue') && isOwner && <AdminMoneyOverview />}
    {activeTab === 'customers' && (isOwner || canSell) && (
      // Имя автора чека — то же, что у кассы: продать теперь можно и с
      // точки на карте, и подписан такой чек должен быть одинаково.
      <AdminCustomers
        lang={lang}
        isOwner={isOwner}
        sellerName={isOwner ? t('Владелец', 'Egasi') : sellerName}
        focus={focus}
        initialQuery={query}
      />
    )}
    {activeTab === 'inventory' && isOwner && <AdminInventory lang={lang} />}
    {activeTab === 'raw_materials' && isOwner && <AdminRawMaterials focus={focus} />}
    {activeTab === 'movements' && isOwner && <AdminMovements lang={lang} />}
    {activeTab === 'orders' && isOwner && <AdminOrders focus={focus} lang={lang} />}
    {activeTab === 'suppliers' && isOwner && <AdminSuppliers lang={lang} />}
    {activeTab === 'debts' && isOwner && <AdminDebts />}
    {activeTab === 'products' && isOwner && <AdminProducts />}
    {activeTab === 'categories' && isOwner && <AdminCategories lang={lang} />}
    {activeTab === 'promo' && isOwner && <AdminPromo lang={lang} />}
    {activeTab === 'finance' && isOwner && <AdminFinance lang={lang} />}
    {activeTab === 'employees' && isOwner && <AdminEmployees lang={lang} />}
    {activeTab === 'shifts' && isOwner && <AdminShifts lang={lang} />}

    {/* ИИ-офис */}
    {activeTab === 'workflow_studio' && isOwner && <AdminWorkflowStudio />}
    {activeTab === 'bot_control' && isOwner && <AdminBotControl lang={lang} />}
    {activeTab === 'bot_health' && isOwner && <AdminBotHealth lang={lang} />}
    {activeTab === 'channels' && isOwner && <AdminChannels lang={lang} />}
    {activeTab === 'tasks' && isOwner && <AdminTasks lang={lang} focus={focus} />}
    {activeTab === 'approvals' && isOwner && <AdminApprovals lang={lang} />}
    {/* Объезды — владельцу: это взгляд на чужую работу. Продавец свой
        план видит на карте, и второй экран ему незачем. */}
    {activeTab === 'visit_plans' && isOwner && <AdminVisitPlans lang={lang} />}
    {activeTab === 'learnings' && isOwner && <AdminLearnings lang={lang} />}
    {activeTab === 'ai_spend' && isOwner && <AdminAiSpend lang={lang} />}

    {/* Отделы. Юзернейм бота больше не вписан здесь: он приходит из реестра
        ИИ-офиса вместе с данными отдела. Прежние захардкоженные имена
        разошлись с реальностью (контент вёл на MG_Finance1_bot, финансы — на
        MG_Content1_bot), а QA/R&D/DevOps указывали на бота руководителя,
        обещая чат отдела, которого не существует. */}
    {/* Один экран вместо десяти вкладок: за всеми отделами стоял один
        компонент с разным идентификатором. Старые адреса `dept_*`
        остаются живыми — по ним приходят ссылки из ИИ-офиса. */}
    {(activeTab === 'departments' || activeTab.startsWith('dept_')) && isOwner && (
      // Отдел берётся из `focus` — так его передаёт офис. Старая ссылка
      // вида `dept_content` тоже открывает свой отдел: имя после префикса
      // и есть идентификатор, и терять его при переезде было бы обидно.
      <AdminDepartments
        lang={lang}
        focus={activeTab.startsWith('dept_') ? activeTab.slice(5) : focus}
      />
    )}

    {/* Контент и журнал */}
    {activeTab === 'magazine' && isOwner && <AdminMagazine />}
    {activeTab === 'magazine_editions' && isOwner && <AdminMagazineIssues lang={lang} />}
    {activeTab === 'magazine_money' && isOwner && <AdminMagazineMoney lang={lang} />}
    {activeTab === 'guest_photos' && isOwner && <AdminGuestPhotos />}
    {/* Материалы и рецепты — один экран. Старый адрес `?tab=recipes`
        остаётся живым и открывает его сразу на рецептах: по нему приходят
        ссылки из ИИ-офиса. */}
    {(activeTab === 'recipes' || activeTab === 'magazine_content') && isOwner && (
      <AdminMagazineContent initialTab={activeTab === 'recipes' ? 'recipes' : 'articles'} />
    )}

    {/* Аналитика и система */}
    {activeTab === 'analytics' && isOwner && <AdminAnalytics />}
    {activeTab === 'forecast' && isOwner && <AdminForecast />}
    {activeTab === 'audit' && isOwner && <AdminAudit lang={lang} />}
    {activeTab === 'settings' && isOwner && <AdminSettings lang={lang} />}
    
    {/* Логистика и сеть */}
    {activeTab === 'deliveries' && isOwner && <AdminDeliveries />}
    {/* Свой рейс открыт и курьеру (canSell), и владельцу: рейс отбирается
        по имени в самом роуте, поэтому чужого здесь не покажут. */}
    {activeTab === 'my_route' && (isOwner || canSell) && <AdminMyRoute lang={lang} />}
    {activeTab === 'franchise' && isOwner && <AdminFranchise />}
  </main>
  );
}
