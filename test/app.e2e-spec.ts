import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * Boots the real AppModule, so a reachable Postgres (per .env) is required.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects GET /auth/me without a token', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('rejects GET /auth/me with a bogus token', () => {
    return request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('rejects POST /auth/login with unknown credentials', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password' })
      .expect(401);
  });

  it('rejects POST /auth/login with a malformed body', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: '' })
      .expect(400);
  });
});

describe('Catalogue (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['/manufacturers', '/generics', '/products', '/variants'])(
    'serves %s publicly with a paginated envelope',
    async (route) => {
      const response = await request(app.getHttpServer())
        .get(route)
        .expect(200);
      const body = response.body as {
        data: unknown[];
        meta: {
          total: number;
          page: number;
          limit: number;
          totalPages: number;
        };
      };

      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(20);
      expect(typeof body.meta.total).toBe('number');
      expect(typeof body.meta.totalPages).toBe('number');
    },
  );

  it('rejects an out-of-range page size', () => {
    return request(app.getHttpServer())
      .get('/variants')
      .query({ limit: 5000 })
      .expect(400);
  });

  it('rejects an unknown pricing_status value', () => {
    return request(app.getHttpServer())
      .get('/variants')
      .query({ pricing_status: 'whatever' })
      .expect(400);
  });

  it('accepts the "needs pricing" worklist filter', () => {
    return request(app.getHttpServer())
      .get('/variants')
      .query({ pricing_status: 'missing' })
      .expect(200);
  });

  it('404s for a variant id that does not exist', () => {
    return request(app.getHttpServer()).get('/variants/99999999').expect(404);
  });

  it('requires a token to update pricing', () => {
    return request(app.getHttpServer())
      .patch('/variants/1/pricing')
      .send({ price: 10.5, stock_quantity: 3 })
      .expect(401);
  });

  it('requires a token to import a CSV', () => {
    return request(app.getHttpServer()).post('/import/csv').expect(401);
  });

  it('exposes no registration endpoint', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'x@example.com', password: 'whatever123' })
      .expect(404);
  });
});

describe('Sales (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['post', '/sales/checkout'],
    ['get', '/sales'],
    ['get', '/sales/1'],
    ['get', '/sales/1/invoice/pdf'],
  ])('requires a token for %s %s', async (method, route) => {
    const agent = request(app.getHttpServer());
    const call = method === 'post' ? agent.post(route) : agent.get(route);
    await call.expect(401);
  });

  describe('checkout request validation', () => {
    // Validation runs before the guard's DB work, but the guard runs first, so
    // these assert the guard rejects rather than the body being accepted.
    it('rejects an empty item list without a token', () => {
      return request(app.getHttpServer())
        .post('/sales/checkout')
        .send({ items: [] })
        .expect(401);
    });
  });

  it('exposes no cart resource', async () => {
    await request(app.getHttpServer()).get('/cart').expect(404);
    await request(app.getHttpServer()).post('/cart/items').expect(404);
  });
});

describe('Dashboard (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['/dashboard/low-stock', '/dashboard/summary'])(
    'requires a token for %s',
    (route) => {
      return request(app.getHttpServer()).get(route).expect(401);
    },
  );

  // The guard runs ahead of the validation pipe, so an unauthenticated request
  // is rejected as 401 whatever the query string says. These assert the routes
  // exist and are protected; the query rules are covered by the unit tests.
  it('does not leak stock levels to an anonymous caller', async () => {
    const response = await request(app.getHttpServer())
      .get('/dashboard/low-stock')
      .expect(401);

    expect(response.body).not.toHaveProperty('length');
  });

  it.each([
    { period: 'today' },
    { period: 'this_week' },
    { period: 'this_month' },
    { from: '2026-07-10', to: '2026-07-15' },
  ])('requires a token for summary query %j', (query) => {
    return request(app.getHttpServer())
      .get('/dashboard/summary')
      .query(query)
      .expect(401);
  });

  it('exposes no real-time stream — the low-stock list is polled', () => {
    return request(app.getHttpServer())
      .get('/dashboard/low-stock/stream')
      .expect(404);
  });
});
