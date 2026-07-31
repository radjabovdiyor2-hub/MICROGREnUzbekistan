import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySession } from '@/lib/session';
import { AdminShell } from './AdminShell';

// ══════════════════════════════════════════════════════════════════════
// Серверная проверка сессии перед отрисовкой админки.
//
// Раньше вся страница была клиентской, а признаком «я владелец» служил
// sessionStorage['Microgreen_admin_auth'] === 'true'. Любой посетитель мог
// вписать этот ключ в консоли браузера и получить полную оболочку админки:
// данные из API не пришли бы (там middleware и роли), но вся структура
// бизнеса — вкладки, отделы, названия операций — была видна как на ладони.
//
// Теперь роль приходит с сервера из подписанной cookie, и подделать её на
// клиенте нельзя. Страница остаётся доступной без сессии — иначе негде
// было бы показать форму входа.
//
// Проверяем ровно то же, что middleware (подпись и срок), без сверки
// fingerprint: middleware её не делает, и односторонняя строгость дала бы
// расхождение — форма входа на экране при живой сессии в API.
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);

  return (
    <AdminShell
      initialRole={session?.role ?? null}
      initialName={session?.name ?? ''}
    />
  );
}
