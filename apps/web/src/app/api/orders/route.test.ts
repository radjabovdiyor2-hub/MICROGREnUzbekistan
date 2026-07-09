import { describe, it, expect, vi } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock Prisma
vi.mock('@repo/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    order: {
      create: vi.fn(),
    },
    stockMovement: {
      create: vi.fn(),
    },
    product: {
      update: vi.fn(),
    },
    $transaction: vi.fn((callbacks) => Promise.resolve(callbacks)),
  }
}));

function createRequest(body: any) {
  return new NextRequest('http://localhost:3000/api/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/orders', () => {
  it('should return 400 if personal data is missing', async () => {
    const req = createRequest({
      items: [{ productId: '123', price: 100, quantity: 1 }]
    });
    
    const response = await POST(req);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Shaxsiy ma'lumotlar to'liq emas");
  });

  it('should return 400 if cart is empty', async () => {
    const req = createRequest({
      customer: { firstName: 'Test', phone: '+998901234567', address: 'Tashkent' },
      items: []
    });
    
    const response = await POST(req);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Savat bo'sh");
  });
});
