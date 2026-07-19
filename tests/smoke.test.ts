/**
 * Smoke Tests — Microgreen Uzbekistan API
 *
 * Проверяют, что основные API-эндпоинты отвечают без ошибок.
 * Не требуют seed-данных: проверяют structure ответа, не содержимое.
 *
 * Запуск: npx tsx tests/smoke.test.ts
 * Или:   node --import tsx tests/smoke.test.ts
 *
 * Требует запущенный dev-сервер на http://localhost:3005
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3005';

interface TestResult {
  name: string;
  passed: boolean;
  ms: number;
  error?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, ms: Date.now() - start });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, ms: Date.now() - start, error: msg });
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function fetchJSON(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  const body = await res.json();
  return { status: res.status, body };
}

// ─── API Route Tests ────────────────────────────────────────

await test('GET /api/products → returns items array', async () => {
  const { status, body } = await fetchJSON('/api/products');
  assert(status === 200, `Expected 200, got ${status}`);
  assert(Array.isArray(body.items), 'Expected items to be an array');
  assert(typeof body.pagination === 'object', 'Expected pagination object');
  assert(typeof body.pagination.total === 'number', 'Expected pagination.total to be number');
});

await test('GET /api/products?count=true → returns counts', async () => {
  const { status, body } = await fetchJSON('/api/products?count=true');
  assert(status === 200, `Expected 200, got ${status}`);
  assert(typeof body.total === 'number', 'Expected total count');
  assert(typeof body.active === 'number', 'Expected active count');
});

await test('GET /api/products?id=nonexistent → 404', async () => {
  const { status, body } = await fetchJSON('/api/products?id=nonexistent_id_12345');
  assert(status === 404, `Expected 404, got ${status}`);
  assert(body.error !== undefined, 'Expected error message');
});

await test('GET /api/categories → returns categories array', async () => {
  const { status, body } = await fetchJSON('/api/categories');
  assert(status === 200, `Expected 200, got ${status}`);
  assert(Array.isArray(body.categories), 'Expected categories array');
});

await test('GET /api/admin/departments → returns departments', async () => {
  const { status, body } = await fetchJSON('/api/admin/departments');
  assert(status === 200, `Expected 200, got ${status}`);
  assert(Array.isArray(body.departments), 'Expected departments array');
  assert(body.departments.length >= 9, `Expected ≥9 departments, got ${body.departments.length}`);
});

await test('GET /api/config → returns public config', async () => {
  const { status } = await fetchJSON('/api/config');
  assert(status === 200, `Expected 200, got ${status}`);
});

await test('POST /api/products without required fields → 400', async () => {
  const { status, body } = await fetchJSON('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nameUz: 'Test' }), // missing slug, price, categoryId
  });
  assert(status === 400, `Expected 400 for missing fields, got ${status}`);
  assert(body.error !== undefined, 'Expected error message');
});

await test('PUT /api/products without id → 400', async () => {
  const { status, body } = await fetchJSON('/api/products', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nameUz: 'Updated' }),
  });
  assert(status === 400, `Expected 400 for missing ID, got ${status}`);
  assert(body.error !== undefined, 'Expected error message');
});

await test('DELETE /api/products without id → 400', async () => {
  const { status, body } = await fetchJSON('/api/products', {
    method: 'DELETE',
  });
  assert(status === 400, `Expected 400 for missing ID, got ${status}`);
  assert(body.error !== undefined, 'Expected error message');
});

await test('POST /api/ai/chat → returns AI response', async () => {
  const { status, body } = await fetchJSON('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Salom' }],
    }),
  });
  // May fail without API key, but should not 500
  assert(status === 200 || status === 429 || status === 503, `Expected 200/429/503, got ${status}`);
});

await test('GET /api/orders → returns orders or auth error', async () => {
  const { status } = await fetchJSON('/api/orders');
  // Without auth, may return 401 or empty array
  assert(status === 200 || status === 401, `Expected 200 or 401, got ${status}`);
});

await test('GET /api/promo → returns promos', async () => {
  const { status } = await fetchJSON('/api/promo');
  assert(status === 200, `Expected 200, got ${status}`);
});

// ─── Page Smoke Tests ───────────────────────────────────────

await test('GET / → homepage returns 200', async () => {
  const res = await fetch(`${BASE_URL}/`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const html = await res.text();
  assert(html.includes('Microgreen'), 'Expected "Microgreen" in HTML');
});

await test('GET /catalog → catalog page returns 200', async () => {
  const res = await fetch(`${BASE_URL}/catalog`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
});

await test('GET /magazine → magazine page returns 200', async () => {
  const res = await fetch(`${BASE_URL}/magazine`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
});

await test('GET /nonexistent-page → returns 404', async () => {
  const res = await fetch(`${BASE_URL}/this-page-does-not-exist-12345`);
  assert(res.status === 404, `Expected 404, got ${res.status}`);
});

// ─── Report ─────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60));
console.log(' SMOKE TEST RESULTS');
console.log('═'.repeat(60));

let passed = 0;
let failed = 0;

for (const r of results) {
  const icon = r.passed ? '✅' : '❌';
  const time = `(${r.ms}ms)`;
  console.log(`${icon} ${r.name} ${time}`);
  if (r.error) console.log(`   → ${r.error}`);
  if (r.passed) passed++;
  else failed++;
}

console.log('─'.repeat(60));
console.log(`Total: ${results.length} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
console.log('═'.repeat(60));

if (failed > 0) process.exit(1);
