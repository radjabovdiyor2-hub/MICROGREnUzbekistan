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

const AdminStats = dynamic(() => import('@/components/admin/AdminStats').then((m) => m.AdminStats), { ssr: false, loading: TabLoading });
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
const AdminRevenue = dynamic(() => import('@/components/admin/AdminRevenue').then((m) => m.AdminRevenue), { ssr: false, loading: TabLoading });
const AdminGrowing = dynamic(() => import('@/components/admin/AdminGrowing').then((m) => m.AdminGrowing), { ssr: false, loading: TabLoading });
const AdminRawMaterials = dynamic(() => import('@/components/admin/AdminRawMaterials').then((m) => m.AdminRawMaterials), { ssr: false, loading: TabLoading });
const AdminCropNorms = dynamic(() => import('@/components/admin/AdminCropNorms').then((m) => m.AdminCropNorms), { ssr: false, loading: TabLoading });
const AdminMagazine = dynamic(() => import('@/components/admin/AdminMagazine').then((m) => m.AdminMagazine), { ssr: false, loading: TabLoading });
const AdminGuestPhotos = dynamic(() => import('@/components/admin/AdminGuestPhotos').then((m) => m.AdminGuestPhotos), { ssr: false, loading: TabLoading });
const AdminRecipes = dynamic(() => import('@/components/admin/AdminRecipes').then((m) => m.AdminRecipes), { ssr: false, loading: TabLoading });
const AdminDepartment = dynamic(() => import('@/components/admin/AdminDepartment').then((m) => m.AdminDepartment), { ssr: false, loading: TabLoading });
const AdminLearnings = dynamic(() => import('@/components/admin/AdminLearnings').then((m) => m.AdminLearnings), { ssr: false, loading: TabLoading });
const AdminCustomers = dynamic(() => import('@/components/admin/AdminCustomers').then((m) => m.AdminCustomers), { ssr: false, loading: TabLoading });
const AdminBotControl = dynamic(() => import('@/components/admin/AdminBotControl').then((m) => m.AdminBotControl), { ssr: false, loading: TabLoading });
const AdminStepan = dynamic(() => import('@/components/admin/AdminStepan').then((m) => m.AdminStepan), { ssr: false, loading: TabLoading });
const AdminBotHealth = dynamic(() => import('@/components/admin/AdminBotHealth').then((m) => m.AdminBotHealth), { ssr: false, loading: TabLoading });
const AdminPromo = dynamic(() => import('@/components/admin/AdminPromo').then((m) => m.AdminPromo), { ssr: false, loading: TabLoading });
const AdminFinance = dynamic(() => import('@/components/admin/AdminFinance').then((m) => m.AdminFinance), { ssr: false, loading: TabLoading });
const AdminAudit = dynamic(() => import('@/components/admin/AdminAudit').then((m) => m.AdminAudit), { ssr: false, loading: TabLoading });
const AdminAiSpend = dynamic(() => import('@/components/admin/AdminAiSpend').then((m) => m.AdminAiSpend), { ssr: false, loading: TabLoading });
const AdminApprovals = dynamic(() => import('@/components/admin/AdminApprovals').then((m) => m.AdminApprovals), { ssr: false, loading: TabLoading });
const AdminVisitPlans = dynamic(() => import('@/components/admin/AdminVisitPlans').then((m) => m.AdminVisitPlans), { ssr: false, loading: TabLoading });
const AdminTasks = dynamic(() => import('@/components/admin/AdminTasks').then((m) => m.AdminTasks), { ssr: false, loading: TabLoading });
const AdminCategories = dynamic(() => import('@/components/admin/AdminCategories').then((m) => m.AdminCategories), { ssr: false, loading: TabLoading });
const AdminDeliveries = dynamic(() => import('@/components/admin/AdminDeliveries').then((m) => m.AdminDeliveries), { ssr: false, loading: TabLoading });
const AdminMyRoute = dynamic(() => import('@/components/admin/AdminMyRoute').then((m) => m.AdminMyRoute), { ssr: false, loading: TabLoading });
const AdminQA = dynamic(() => import('@/components/admin/AdminQA').then((m) => m.AdminQA), { ssr: false, loading: TabLoading });
const AdminExperiments = dynamic(() => import('@/components/admin/AdminExperiments').then((m) => m.AdminExperiments), { ssr: false, loading: TabLoading });
const AdminFranchise = dynamic(() => import('@/components/admin/AdminFranchise').then((m) => m.AdminFranchise), { ssr: false, loading: TabLoading });
const AdminWorkflowStudio = dynamic(() => import('@/components/admin/AdminWorkflowStudio').then((m) => m.AdminWorkflowStudio), { ssr: false, loading: TabLoading });

export function AdminTabRouter({ activeTab, focus, query, isOwner, canGrow, canSell, sellerName, lang, t }: {
  activeTab: string;
  /**
   * Запись, ради которой пришли по ссылке из Telegram (`?focus=`).
   *
   * Ссылку строит ИИ-офис (`shared/admin_links.py`) из заявки владельцу:
   * номер задачи, заказа, партии. Экраны, которым выделять нечего, его
   * просто не берут — вкладка всё равно открыта правильная.
   */
  focus: string;
  /** Что положить в поиск раздела при открытии (`?q=`). */
  query?: string;
  isOwner: boolean;
  /** Владелец или агроном — теплица открыта обоим. */
  canGrow: boolean;
  /** Владелец или продавец — касса. Агроному она не нужна. */
  canSell: boolean;
  sellerName: string;
  lang: 'ru' | 'uz';
  t: (ru: string, uz: string) => string;
}) {
  return (
  <main className="admin-main">
    {activeTab === 'pos' && canSell && <AdminPOS sellerName={isOwner ? t('Владелец', 'Egasi') : sellerName} isOwner={isOwner} />}
    {activeTab === 'stepan' && isOwner && <AdminStepan lang={lang} />}
    {activeTab === 'stats' && isOwner && <AdminStats />}
    {activeTab === 'revenue' && isOwner && <AdminRevenue />}
    {activeTab === 'growing' && canGrow && <AdminGrowing focus={focus} />}
    {activeTab === 'crop_norms' && isOwner && <AdminCropNorms />}
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
    {activeTab === 'inventory' && isOwner && <AdminInventory />}
    {activeTab === 'raw_materials' && isOwner && <AdminRawMaterials focus={focus} />}
    {activeTab === 'movements' && isOwner && <AdminMovements />}
    {activeTab === 'orders' && isOwner && <AdminOrders focus={focus} />}
    {activeTab === 'suppliers' && isOwner && <AdminSuppliers />}
    {activeTab === 'debts' && isOwner && <AdminDebts />}
    {activeTab === 'products' && isOwner && <AdminProducts />}
    {activeTab === 'categories' && isOwner && <AdminCategories lang={lang} />}
    {activeTab === 'promo' && isOwner && <AdminPromo lang={lang} />}
    {activeTab === 'finance' && isOwner && <AdminFinance lang={lang} />}
    {activeTab === 'employees' && isOwner && <AdminEmployees />}
    {activeTab === 'shifts' && isOwner && <AdminShifts />}

    {/* ИИ-офис */}
    {activeTab === 'workflow_studio' && isOwner && <AdminWorkflowStudio />}
    {activeTab === 'bot_control' && isOwner && <AdminBotControl lang={lang} />}
    {activeTab === 'bot_health' && isOwner && <AdminBotHealth lang={lang} />}
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
    {activeTab === 'dept_sales' && isOwner && <AdminDepartment departmentId="sales" departmentName={t('Продажи', 'Sotuvlar')} lang={lang} />}
    {activeTab === 'dept_marketing' && isOwner && <AdminDepartment departmentId="marketing" departmentName={t('Маркетинг', 'Marketing')} lang={lang} />}
    {activeTab === 'dept_content' && isOwner && <AdminDepartment departmentId="content" departmentName={t('Контент', 'Kontent')} lang={lang} />}
    {activeTab === 'dept_hr' && isOwner && <AdminDepartment departmentId="hr" departmentName={t('Кадры (HR)', 'Kadrlar (HR)')} lang={lang} />}
    {activeTab === 'dept_finance' && isOwner && <AdminDepartment departmentId="finance" departmentName={t('Финансы', 'Moliya')} lang={lang} />}
    {activeTab === 'dept_analytics' && isOwner && <AdminDepartment departmentId="analytics" departmentName={t('Аналитика', 'Analitika')} lang={lang} />}
    {activeTab === 'dept_devops' && isOwner && <AdminDepartment departmentId="devops" departmentName={t('DevOps / IT', 'DevOps / IT')} lang={lang} />}
    {activeTab === 'dept_qa' && isOwner && <AdminDepartment departmentId="qa" departmentName={t('QA / Качество', 'QA / Sifat')} lang={lang} />}
    {activeTab === 'dept_rnd' && isOwner && <AdminDepartment departmentId="rnd" departmentName={t('R&D', 'R&D')} lang={lang} />}
    {activeTab === 'dept_support' && isOwner && <AdminDepartment departmentId="support" departmentName={t('Поддержка', "Qo'llab-quvvatlash")} lang={lang} />}

    {/* Контент и журнал */}
    {activeTab === 'magazine' && isOwner && <AdminMagazine />}
    {activeTab === 'guest_photos' && isOwner && <AdminGuestPhotos />}
    {activeTab === 'recipes' && isOwner && <AdminRecipes />}

    {/* Аналитика и система */}
    {activeTab === 'analytics' && isOwner && <AdminAnalytics />}
    {activeTab === 'forecast' && isOwner && <AdminForecast />}
    {activeTab === 'audit' && isOwner && <AdminAudit lang={lang} />}
    {activeTab === 'settings' && isOwner && <AdminSettings lang={lang} />}
    
    {/* Производство и Сеть */}
    {activeTab === 'deliveries' && isOwner && <AdminDeliveries />}
    {/* Свой рейс открыт и курьеру (canSell), и владельцу: рейс отбирается
        по имени в самом роуте, поэтому чужого здесь не покажут. */}
    {activeTab === 'my_route' && (isOwner || canSell) && <AdminMyRoute lang={lang} />}
    {activeTab === 'qa' && isOwner && <AdminQA />}
    {activeTab === 'experiments' && isOwner && <AdminExperiments />}
    {activeTab === 'franchise' && isOwner && <AdminFranchise />}
  </main>
  );
}
