import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { getSettings, setSettings } from '@/lib/settings/store';
import {
  SETTINGS, SETTING_CATEGORIES, CATEGORY_LABELS, type SettingDef,
} from '@/lib/settings/registry';

// ══════════════════════════════════════════════════════════════════════
// Настройки бизнеса для админки.
//
// GET отдаёт не только значения, но и описание полей (тип, границы,
// подписи) — форма в UI строится из этого ответа, поэтому новый ключ в
// реестре появляется в интерфейсе сам, без правки компонента.
//
// Маршрут закрыт middleware (/api/admin → ADMIN), isAuthorized здесь —
// второй слой на случай ошибки в правилах middleware.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const values = await getSettings();

  const fields = Object.entries(SETTINGS).map(([key, raw]) => {
    const def = raw as SettingDef;
    return {
      key,
      category: def.category,
      type: def.type,
      labelRu: def.labelRu,
      labelUz: def.labelUz,
      hintRu: def.hintRu ?? null,
      min: def.min ?? null,
      max: def.max ?? null,
      default: def.default,
      value: values[key],
      /** Изменено владельцем — в UI помечаем, чтобы было видно отклонения. */
      modified: JSON.stringify(values[key]) !== JSON.stringify(def.default),
    };
  });

  return NextResponse.json({
    status: 'ok',
    categories: SETTING_CATEGORIES.map(id => ({ id, ...CATEGORY_LABELS[id] })),
    fields,
  });
}

export async function PUT(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const patch = (body?.settings ?? body) as Record<string, unknown>;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return NextResponse.json({ error: 'Ожидается объект с настройками' }, { status: 400 });
  }

  const { applied, errors } = await setSettings(patch, 'owner');

  if (Object.keys(applied).length) {
    audit({
      action: 'settings.update',
      actor: 'owner',
      role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: Object.keys(applied).join(','),
      meta: { applied },
    });
  }

  // Частичный успех — 200 с разбором по ключам: UI подсветит проблемные
  // поля и оставит сохранённые. 400 отдаём только если не прошло ничего.
  const status = Object.keys(applied).length === 0 && Object.keys(errors).length ? 400 : 200;
  return NextResponse.json({ status: status === 200 ? 'ok' : 'error', applied, errors }, { status });
}
