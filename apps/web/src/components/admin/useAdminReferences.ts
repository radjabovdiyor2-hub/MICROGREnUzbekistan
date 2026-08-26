'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchBatches, type Batch } from './growingData';

// ══════════════════════════════════════════════════════════════════════
// Справочники для форм админки: поставщики, сотрудники, партии, нормы.
//
// ЗАЧЕМ ОДНО МЕСТО
//
// Эти списки заполняют выпадающие поля в семи формах, и каждая форма
// запрашивала их сама, своим `useEffect` при монтировании. `/api/inventory
// /suppliers` дёргался из трёх мест, `/api/inventory/employees` — из трёх;
// открыл форму прихода, закрыл, открыл снова — три новых запроса за то же
// самое. Списки при этом меняются раз в месяц.
//
// Через общий кэш формы открываются мгновенно и переиспользуют уже
// полученное. Ключи `admin-*` совпадают с теми, что инвалидируют экраны
// поставщиков и сотрудников, — завёл нового поставщика, и он тут же есть
// в выпадающем списке формы прихода, без перезагрузки страницы.
//
// `staleTime` не задаём: общий по умолчанию (60 с) для справочников как раз
// уместен, а событийная инвалидация делает точность вопросом не времени,
// а факта изменения.
// ══════════════════════════════════════════════════════════════════════

export interface RefSupplier {
  id: string;
  name: string;
  phone?: string | null;
}

export interface RefEmployee {
  id: string;
  name: string;
}

export interface RefOrder {
  id: string;
  orderNumber: string;
  status: string;
  phone: string;
  address: string;
  total: number;
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Справочник недоступен: ${url}`);
  return res.json();
}

/** Поставщики — для приходов, долгов и сырья. */
export function useSuppliers() {
  const { data } = useQuery<RefSupplier[]>({
    queryKey: ['admin-suppliers'],
    queryFn: async () => ((await getJson('/api/inventory/suppliers')).suppliers ?? []) as RefSupplier[],
  });
  return data ?? [];
}

/** Сотрудники — авторы движений, водители, продавцы. */
export function useEmployees() {
  const { data } = useQuery<RefEmployee[]>({
    queryKey: ['admin-employees-list'],
    queryFn: async () => ((await getJson('/api/inventory/employees')).employees ?? []) as RefEmployee[],
  });
  return data ?? [];
}

/**
 * Заказы, которые ещё надо отвезти, — для формы маршрута.
 *
 * До этого точку маршрута собирали, перепечатывая адрес и телефон из
 * карточки заказа руками, хотя `POST /api/admin/deliveries` принимает
 * `orderId` с первого дня. Перепечатанный адрес расходится с заказом при
 * первой же опечатке, и найти потом, какой заказ уехал на этой машине,
 * нельзя вовсе: связи между ними не оставалось.
 *
 * Доставленные и отменённые сюда не попадают: везти их незачем.
 */
export function usePendingOrders() {
  const { data } = useQuery<RefOrder[]>({
    queryKey: ['admin-orders-pending-delivery'],
    queryFn: async () => {
      const json = await getJson('/api/orders?limit=100');
      const orders = (json.orders ?? []) as RefOrder[];
      return orders.filter((o) => !['DELIVERED', 'CANCELLED'].includes(o.status));
    },
  });
  return data ?? [];
}

/**
 * Партии посадок — для отчётов ОТК и экрана теплицы.
 *
 * Запрос идёт через `fetchBatches` из `growingData`, а не своим `fetch`:
 * там же лежит разбор ответа (`status: 'ok'`) и тип `Batch`, и вторая копия
 * этого знания разошлась бы с первой при первом же изменении роута.
 */
export function useGrowBatches() {
  const { data } = useQuery<Batch[]>({
    queryKey: ['admin-grow-batches'],
    queryFn: fetchBatches,
  });
  return data ?? [];
}
