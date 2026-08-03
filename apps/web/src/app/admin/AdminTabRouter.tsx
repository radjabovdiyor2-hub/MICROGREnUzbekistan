'use client';

import { AdminStats } from '@/components/admin/AdminStats';
import { AdminOrders } from '@/components/admin/AdminOrders';
import { AdminProducts } from '@/components/admin/AdminProducts';
import { AdminPOS } from '@/components/admin/AdminPOS';
import { AdminInventory } from '@/components/admin/AdminInventory';
import { AdminDebts } from '@/components/admin/AdminDebts';
import { AdminMovements } from '@/components/admin/AdminMovements';
import { AdminSuppliers } from '@/components/admin/AdminSuppliers';
import { AdminEmployees } from '@/components/admin/AdminEmployees';
import { AdminShifts } from '@/components/admin/AdminShifts';
import { AdminAnalytics } from '@/components/admin/AdminAnalytics';
import { AdminForecast } from '@/components/admin/AdminForecast';
import { AdminSettings } from '@/components/admin/AdminSettings';
import { AdminRevenue } from '@/components/admin/AdminRevenue';
import { AdminGrowing } from '@/components/admin/AdminGrowing';
import { AdminMagazine } from '@/components/admin/AdminMagazine';
import { AdminGuestPhotos } from '@/components/admin/AdminGuestPhotos';
import { AdminRecipes } from '@/components/admin/AdminRecipes';
import { AdminDepartment } from '@/components/admin/AdminDepartment';
import { AdminLearnings } from '@/components/admin/AdminLearnings';
import { AdminCustomers } from '@/components/admin/AdminCustomers';
import { AdminBotControl } from '@/components/admin/AdminBotControl';
import { AdminStepan } from '@/components/admin/AdminStepan';
import { AdminBotHealth } from '@/components/admin/AdminBotHealth';
import { AdminPromo } from '@/components/admin/AdminPromo';
import { AdminFinance } from '@/components/admin/AdminFinance';
import { AdminAudit } from '@/components/admin/AdminAudit';
import { AdminAiSpend } from '@/components/admin/AdminAiSpend';
import { AdminTasks } from '@/components/admin/AdminTasks';
import { AdminCategories } from '@/components/admin/AdminCategories';
import { AdminDeliveries } from '@/components/admin/AdminDeliveries';
import { AdminQA } from '@/components/admin/AdminQA';
import { AdminExperiments } from '@/components/admin/AdminExperiments';
import { AdminFranchise } from '@/components/admin/AdminFranchise';
import { AdminWorkflowStudio } from '@/components/admin/AdminWorkflowStudio';

// Маршрутизация вкладок админки: какая вкладка — такой экран.
// Вынесено из AdminShell: файл перерос 200 строк, и почти половину его
// занимал этот список.

export function AdminTabRouter({ activeTab, isOwner, sellerName, lang, t }: {
  activeTab: string;
  isOwner: boolean;
  sellerName: string;
  lang: 'ru' | 'uz';
  t: (ru: string, uz: string) => string;
}) {
  return (
  <main className="admin-main">
    {activeTab === 'pos' && <AdminPOS sellerName={isOwner ? t('Владелец', 'Egasi') : sellerName} />}
    {activeTab === 'stepan' && isOwner && <AdminStepan lang={lang} />}
    {activeTab === 'stats' && isOwner && <AdminStats />}
    {activeTab === 'revenue' && isOwner && <AdminRevenue />}
    {activeTab === 'growing' && isOwner && <AdminGrowing />}
    {activeTab === 'customers' && isOwner && <AdminCustomers lang={lang} />}
    {activeTab === 'inventory' && isOwner && <AdminInventory />}
    {activeTab === 'movements' && isOwner && <AdminMovements />}
    {activeTab === 'orders' && isOwner && <AdminOrders />}
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
    {activeTab === 'tasks' && isOwner && <AdminTasks lang={lang} />}
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
    {activeTab === 'qa' && isOwner && <AdminQA />}
    {activeTab === 'experiments' && isOwner && <AdminExperiments />}
    {activeTab === 'franchise' && isOwner && <AdminFranchise />}
  </main>
  );
}
