// Справочник культур и расчёт фазы выращивания.
// Вынесено из AdminGrowing: чистые данные и функции без состояния,
// занимавшие пятую часть файла.

// Microgreen crop database with growing parameters
export const CROP_DB: Record<string, { nameRu: string; darkDays: number; lightDays: number; shelfDays: number; color: string }> = {
  'radish': { nameRu: 'Редис', darkDays: 3, lightDays: 4, shelfDays: 7, color: 'var(--error)' },
  'broccoli': { nameRu: 'Брокколи', darkDays: 3, lightDays: 6, shelfDays: 7, color: 'var(--success)' },
  'sunflower': { nameRu: 'Подсолнух', darkDays: 4, lightDays: 6, shelfDays: 7, color: 'var(--warning)' },
  'pea': { nameRu: 'Горошек', darkDays: 4, lightDays: 8, shelfDays: 7, color: 'var(--cat-7)' },
  'arugula': { nameRu: 'Руккола', darkDays: 3, lightDays: 5, shelfDays: 7, color: 'var(--cat-1)' },
  'mustard': { nameRu: 'Горчица', darkDays: 3, lightDays: 4, shelfDays: 7, color: 'var(--cat-6)' },
  'amaranth': { nameRu: 'Амарант', darkDays: 4, lightDays: 8, shelfDays: 5, color: 'var(--cat-3)' },
  'basil': { nameRu: 'Базилик', darkDays: 4, lightDays: 10, shelfDays: 5, color: 'var(--cat-2)' },
  'cilantro': { nameRu: 'Кинза', darkDays: 5, lightDays: 10, shelfDays: 7, color: 'var(--cat-4)' },
  'kohlrabi': { nameRu: 'Кольраби', darkDays: 3, lightDays: 5, shelfDays: 7, color: 'var(--cat-9)' },
  'mizuna': { nameRu: 'Мизуна', darkDays: 3, lightDays: 5, shelfDays: 7, color: 'var(--brand-primary-hover)' },
  'wheatgrass': { nameRu: 'Витграсс', darkDays: 3, lightDays: 6, shelfDays: 5, color: 'var(--cat-10)' },
  'spinach': { nameRu: 'Шпинат', darkDays: 3, lightDays: 8, shelfDays: 5, color: 'var(--cat-11)' },
  'beet': { nameRu: 'Свёкла', darkDays: 4, lightDays: 8, shelfDays: 5, color: 'var(--cat-8)' },
  'cabbage': { nameRu: 'Капуста', darkDays: 3, lightDays: 5, shelfDays: 7, color: 'var(--cat-12)' },
  'other': { nameRu: 'Другое', darkDays: 3, lightDays: 6, shelfDays: 5, color: 'var(--text-secondary)' },
};

export interface Batch {
  id: string;
  cropType: string;
  trays: number;
  seedDate: string; // ISO date
  darkDays: number;
  lightDays: number;
  shelfDays: number;
  note: string;
  status: 'dark' | 'light' | 'ready' | 'harvested' | 'expired';
  harvestDate?: string;
  productId?: string;
  productName?: string;
  harvestQty?: number;
  costPrice?: number; // себестоимость за единицу урожая (после сбора)
  // ── Себестоимость партии, посчитанная при посадке из списанного сырья ──
  // Без этих полей «убыток» просроченной партии всегда выходил нулём:
  // он считался из costPrice, а тот до сбора не существует.
  seedCost?: number | null;
  suppliesCost?: number | null;
  batchCost?: number;
  plannedYield?: number | null;
}

/** Норма культуры из базы (таблица crop_norms). */
export interface CropNorm {
  id: string;
  cropType: string;
  nameRu: string;
  seedGramsPerTray: number;
  substrateGramsPerTray: number | null;
  packagingPerTray: number | null;
  yieldPerTray: number | null;
  darkDays: number;
  lightDays: number;
  shelfDays: number;
}

/** Что уйдёт со склада на посадку — предпросмотр до её создания. */
export interface PlantingRequirement {
  kind: string;
  label: string;
  required: number;
  enough: boolean;
  cost: number | null;
  material: { id: string; name: string; unit: string; stock: number; avgCost: number } | null;
}

export async function fetchCropNorms(): Promise<CropNorm[]> {
  const res = await fetch('/api/admin/crop-norms', { credentials: 'same-origin' });
  const data = await res.json();
  return data.status === 'ok' ? (data.norms as CropNorm[]) : [];
}

/**
 * Сколько сырья нужно на посадку и хватает ли его.
 *
 * Возвращает `null`, если норм для культуры ещё нет: форма должна попросить
 * их задать, а не молча посадить партию без себестоимости.
 */
export async function fetchPlantingRequirements(
  cropType: string,
  trays: number,
): Promise<{ needs: PlantingRequirement[]; estimatedCost: number } | { error: string } | null> {
  const res = await fetch(
    `/api/admin/grow-batches?requirements=${encodeURIComponent(cropType)}&trays=${trays}`,
    { credentials: 'same-origin' },
  );
  const data = await res.json();
  if (res.status === 409) return { error: data.error as string };
  if (!res.ok || data.status !== 'ok') return null;
  return { needs: data.needs as PlantingRequirement[], estimatedCost: data.estimatedCost };
}

export interface ProductOption {
  id: string;
  nameUz: string;
  nameRu: string;
  stock: number;
  costPrice?: number;
  price: number;
}

// ══════════════════════════════════════════════════════════════════════
// Партии хранятся в базе (таблица grow_batches), а не в localStorage.
//
// Раньше весь производственный план жил в браузере: с телефона посадок
// не было видно, очистка кэша стирала их целиком, а бот и отчёты о них
// вообще не знали. Ключ ниже нужен только для разового переноса того,
// что уже накопилось у владельца в браузере.
// ══════════════════════════════════════════════════════════════════════

export const LEGACY_KEY = 'mg_grow_batches';
export const MIGRATED_KEY = 'mg_grow_batches_migrated';

export async function fetchBatches(): Promise<Batch[]> {
  const res = await fetch('/api/admin/grow-batches?all=1', { credentials: 'same-origin' });
  const data = await res.json();
  return data.status === 'ok' ? (data.batches as Batch[]) : [];
}

/**
 * Разовый перенос партий из localStorage в базу.
 *
 * Флаг ставим ДО отправки: повторный запуск при частичной ошибке создал бы
 * дубли, а потерянную партию владелец увидит и заведёт заново — это
 * дешевле, чем разбирать удвоенный список.
 */
export async function migrateLegacyBatches(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (localStorage.getItem(MIGRATED_KEY)) return false;

  let legacy: Batch[] = [];
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
  } catch {
    legacy = [];
  }

  localStorage.setItem(MIGRATED_KEY, '1');
  if (!Array.isArray(legacy) || !legacy.length) return false;

  for (const b of legacy) {
    try {
      await fetch('/api/admin/grow-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          cropType: b.cropType, trays: b.trays, seedDate: b.seedDate,
          darkDays: b.darkDays, lightDays: b.lightDays, shelfDays: b.shelfDays,
          note: b.note,
        }),
      });
    } catch {
      // Продолжаем: одна неудача не должна оборвать перенос остальных.
    }
  }
  return true;
}

export function daysBetween(a: string, b: string) {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export function getBatchStatus(batch: Batch): { status: Batch['status']; phase: string; daysInPhase: number; daysLeft: number; progress: number; alert?: string } {
  if (batch.status === 'harvested') return { status: 'harvested', phase: 'Собрано', daysInPhase: 0, daysLeft: 0, progress: 100 };

  const now = new Date().toISOString().slice(0, 10);
  const elapsed = daysBetween(batch.seedDate, now);
  const darkEnd = batch.darkDays;
  const lightEnd = darkEnd + batch.lightDays;
  const shelfEnd = lightEnd + batch.shelfDays;

  if (elapsed < darkEnd) {
    return { status: 'dark', phase: 'Тёмная фаза', daysInPhase: elapsed, daysLeft: darkEnd - elapsed, progress: (elapsed / shelfEnd) * 100 };
  }
  if (elapsed < lightEnd) {
    const d = elapsed - darkEnd;
    return { status: 'light', phase: 'На свету', daysInPhase: d, daysLeft: lightEnd - elapsed, progress: (elapsed / shelfEnd) * 100 };
  }
  if (elapsed < shelfEnd) {
    const d = elapsed - lightEnd;
    const left = shelfEnd - elapsed;
    return {
      status: 'ready', phase: 'Готов к продаже!', daysInPhase: d, daysLeft: left,
      progress: (elapsed / shelfEnd) * 100,
      alert: left <= 2 ? `Срочно продайте! Осталось ${left} дн.` : `Продавайте! Хранение ещё ${left} дн.`,
    };
  }
  return { status: 'expired', phase: 'Просрочен!', daysInPhase: elapsed - shelfEnd, daysLeft: 0, progress: 100, alert: 'СПИСАНИЕ — товар просрочен!' };
}
