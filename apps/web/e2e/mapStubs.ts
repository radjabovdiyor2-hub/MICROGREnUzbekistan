import type { Page } from "@playwright/test";

// ══════════════════════════════════════════════════════════════════════
// Заглушки карты: один набор данных на все её сценарии.
//
// Копий было две, написанных порознь, и это ровно тот случай, про который
// в adminNav.ts уже сказано: две версии расходятся на первой же правке и
// расходятся молча — обе компилируются. Третья копия появлялась вместе с
// проверкой раскладки, поэтому набор переехал сюда.
// ══════════════════════════════════════════════════════════════════════

/** Минимальный валидный стиль: карта поднимается, сеть не нужна. */
export const STUB_STYLE = {
  version: 8,
  name: "stub",
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#eeeeee" } }],
};

export const POINTS = [
  { id: 1, n: "Плов Центр", st: "healthy", vt: "top", sp: 900000, lv: 2, gs: "manual" },
  { id: 2, n: "Registon Cafe", st: "at_risk", vt: "mid", sp: 200000, lv: 40, gs: "2gis" },
  { id: 3, n: "Чайхана Чорсу", st: "slipping", vt: "low", sp: 90000, lv: 9, gs: "seed" },
];

export const COLLECTION = {
  type: "FeatureCollection",
  features: POINTS.map((p, i) => ({
    type: "Feature",
    id: p.id,
    geometry: { type: "Point", coordinates: [66.9597 + i * 0.004, 39.627 + i * 0.002] },
    properties: {
      n: p.n,
      t: "b2b",
      st: p.st,
      sp: p.sp,
      oc: 6,
      dl: 4,
      ov: 0.4,
      vt: p.vt,
      d: "samarkand-center",
      ct: "restaurant",
      au: null,
      gs: p.gs,
      ph: "+998901234567",
      ad: "ул. Регистан, 5",
      gp: "exact",
      lv: p.lv,
      k: "customer",
    },
  })),
  summary: {
    total: 5,
    placed: 3,
    unplaced: 2,
    byState: { prospect: 0, new: 0, healthy: 1, slipping: 1, at_risk: 1, lost: 0 },
    revenueByState: { prospect: 0, new: 0, healthy: 900000, slipping: 90000, at_risk: 200000, lost: 0 },
    spentPercentiles: { p50: 200000, p80: 900000 },
    districts: [
      { district: "samarkand-center", customers: 3, revenue: 1190000, atRisk: 1, prospects: 0, byCategory: { restaurant: 3 } },
    ],
    coverage: { exact: 3, rough: 0, missing: 2, total: 5, percent: 60 },
  },
  unplaced: [
    { id: 8, name: "Baraka Non", city: "Samarqand", address: "ул. Навои, 3", ordersCount: 2, totalSpent: 40000, lastOrderDate: null, state: "new", companyType: "bakery" },
    { id: 9, name: "Sam Ped Kolledj", city: "Samarqand", address: null, ordersCount: 0, totalSpent: 0, lastOrderDate: null, state: "lost", companyType: "canteen" },
  ],
};

export async function stubAdmin(page: Page) {
  // Общая заглушка идёт ПЕРВОЙ: Playwright проверяет перехватчики от
  // позднего к раннему.
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/tiles.openfreemap.org/styles/**", (route) =>
    route.fulfill({ json: STUB_STYLE }),
  );
  await page.route("**/api/auth/password", (route) => route.fulfill({ json: { valid: true } }));
  await page.route("**/api/admin/customers/map/delivery**", (route) =>
    route.fulfill({ json: { routes: [] } }),
  );
  await page.route("**/api/admin/customers/map**", (route) => route.fulfill({ json: COLLECTION }));
}
