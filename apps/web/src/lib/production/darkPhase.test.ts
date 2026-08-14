import { describe, expect, it } from 'vitest';
import { daysSince } from './growWatch';
import { getBatchStatus, type Batch } from '@/components/admin/growingData';

// ══════════════════════════════════════════════════════════════════════
// Досрочное открытие партии.
//
// Случай владельца: посадили, в тёмном режиме партия готова за 3 дня, а в
// норме культуры стоит 4 — и открыть её было нечем. Фаза нигде не хранится,
// она считается из даты посева и числа тёмных дней, поэтому «открыть» — это
// поставить партии столько тёмных дней, сколько она реально прожила.
//
// Проверяем именно это: после правки числа расчёт фазы обязан отдать «свет».
// Календарь при этом ОДИН на всю систему (`daysSince`) — админка, серверные
// оповещения и бот считают одинаково, и разойдись они на день, открытая
// партия осталась бы «в темноте» на экране.
// ══════════════════════════════════════════════════════════════════════

const DAY = 86_400_000;

function batchSeededDaysAgo(days: number, overrides: Partial<Batch> = {}): Batch {
  const seed = new Date(Date.now() - days * DAY);
  return {
    id: 'b1',
    cropType: 'radish',
    trays: 10,
    seedDate: seed.toISOString().slice(0, 10),
    darkDays: 4,
    lightDays: 6,
    shelfDays: 5,
    status: 'dark',
    note: '',
    harvestDate: null,
    harvestQty: null,
    costPrice: null,
    productId: null,
    productName: null,
    ...overrides,
  } as Batch;
}

describe('счёт дней с посева', () => {
  it('считает календарные сутки, а не часы', () => {
    const seed = new Date(2026, 7, 10, 23, 30);
    const now = new Date(2026, 7, 11, 0, 30);
    // Час разницы, но день другой: партия «прожила» сутки.
    expect(daysSince(seed, now)).toBe(1);
  });

  it('в день посева прошло ноль дней', () => {
    const d = new Date(2026, 7, 10, 8, 0);
    expect(daysSince(d, new Date(2026, 7, 10, 22, 0))).toBe(0);
  });
});

describe('досрочное открытие', () => {
  it('партия на 4-м дне при норме 4 ещё в темноте', () => {
    const batch = batchSeededDaysAgo(3, { darkDays: 4 });
    expect(getBatchStatus(batch).status).toBe('dark');
  });

  it('открыли — darkDays становится фактическим, и партия на свету', () => {
    // Ровно случай владельца: посеяли 3 дня назад, в норме 4, открываем.
    const opened = batchSeededDaysAgo(3, { darkDays: 3 });
    const info = getBatchStatus(opened);
    expect(info.status).toBe('light');
    expect(info.phase).toBe('На свету');
  });

  it('«ещё день» оставляет партию в темноте ровно на сутки', () => {
    const extended = batchSeededDaysAgo(3, { darkDays: 4 });
    expect(getBatchStatus(extended).status).toBe('dark');
    expect(getBatchStatus(extended).daysLeft).toBe(1);
  });

  it('открытие сдвигает и готовность, и срок хранения', () => {
    // Свет начался раньше — значит и «готов», и «просрочен» наступят раньше.
    // Это не побочный эффект, а физика: длительность светового этапа та же.
    const byNorm = batchSeededDaysAgo(10, { darkDays: 4, lightDays: 6, shelfDays: 5 });
    const opened = batchSeededDaysAgo(10, { darkDays: 3, lightDays: 6, shelfDays: 5 });
    expect(getBatchStatus(byNorm).status).toBe('ready');
    expect(getBatchStatus(opened).status).toBe('ready');
    // У открытой партии срока хранения остаётся на день меньше.
    expect(getBatchStatus(opened).daysLeft).toBe(getBatchStatus(byNorm).daysLeft - 1);
  });

  it('собранную партию открывать нечего — фаза уже конечная', () => {
    const harvested = batchSeededDaysAgo(3, { status: 'harvested' });
    expect(getBatchStatus(harvested).status).toBe('harvested');
  });
});
