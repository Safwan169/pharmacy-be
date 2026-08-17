import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import { DashboardService } from './dashboard.service';

const LOW_STOCK_THRESHOLD = 5;

/** Mirrors the fluent chain in DashboardService.lowStock(). */
interface QueryBuilderMock {
  innerJoinAndSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  getMany: jest.Mock;
}

function createQueryBuilderMock(variants: unknown[]): QueryBuilderMock {
  const builder: Partial<QueryBuilderMock> = {};
  for (const method of [
    'innerJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
  ] as const) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.getMany = jest.fn().mockResolvedValue(variants);
  return builder as QueryBuilderMock;
}

function buildVariant(overrides: Partial<ProductVariant>): ProductVariant {
  return {
    id: 1,
    dosageForm: 'Tablet',
    strength: '500 mg',
    stockQuantity: 2,
    product: {
      brandName: 'Napa',
      manufacturer: { name: 'Beximco Pharmaceuticals Ltd.' },
    },
    ...overrides,
  } as ProductVariant;
}

describe('DashboardService — low stock', () => {
  let service: DashboardService;
  let queryBuilder: QueryBuilderMock;
  let variantsRepository: { createQueryBuilder: jest.Mock };

  async function buildService(variants: unknown[]): Promise<void> {
    queryBuilder = createQueryBuilderMock(variants);
    variantsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getRepositoryToken(ProductVariant),
          useValue: variantsRepository,
        },
        { provide: getDataSourceToken(), useValue: { query: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue(LOW_STOCK_THRESHOLD),
          },
        },
      ],
    }).compile();

    service = module.get(DashboardService);
  }

  it('should filter on the configured threshold rather than a hardcoded number', async () => {
    await buildService([]);

    await service.lowStock();

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'variant.stockQuantity < :threshold',
      { threshold: LOW_STOCK_THRESHOLD },
    );
  });

  it('should exclude variants whose stock was never counted', async () => {
    await buildService([]);

    await service.lowStock();

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'variant.stockQuantity IS NOT NULL',
    );
  });

  it('should keep withdrawn SKUs out of the restock worklist', async () => {
    await buildService([]);

    await service.lowStock();

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'variant.isActive = true',
    );
  });

  it('should order the most urgent items first, breaking ties stably', async () => {
    await buildService([]);

    await service.lowStock();

    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'variant.stockQuantity',
      'ASC',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('variant.id', 'ASC');
  });

  it('should flatten the variant/product/manufacturer join into a widget row', async () => {
    await buildService([buildVariant({ id: 123, stockQuantity: 2 })]);

    const items = await service.lowStock();

    expect(items).toEqual([
      {
        variant_id: 123,
        brand_name: 'Napa',
        dosage_form: 'Tablet',
        strength: '500 mg',
        manufacturer: 'Beximco Pharmaceuticals Ltd.',
        stock_quantity: 2,
      },
    ]);
  });

  it('should report a confirmed zero-stock variant rather than skipping it', async () => {
    await buildService([buildVariant({ id: 7, stockQuantity: 0 })]);

    const items = await service.lowStock();

    expect(items[0].stock_quantity).toBe(0);
  });

  it('should carry a null strength through untouched', async () => {
    await buildService([buildVariant({ strength: null })]);

    const items = await service.lowStock();

    expect(items[0].strength).toBeNull();
  });

  it('should return an empty list when nothing is low', async () => {
    await buildService([]);

    expect(await service.lowStock()).toEqual([]);
  });
});

describe('DashboardService — sales summary', () => {
  let service: DashboardService;
  let query: jest.Mock;

  const EMPTY_ROW = {
    total_earning: '0',
    total_transactions: '0',
    total_units_sold: '0',
    distinct_products_sold: '0',
  };

  async function buildService(row: Record<string, string>): Promise<void> {
    query = jest.fn().mockResolvedValue([row]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getRepositoryToken(ProductVariant),
          useValue: { createQueryBuilder: jest.fn() },
        },
        { provide: getDataSourceToken(), useValue: { query } },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue(LOW_STOCK_THRESHOLD),
          },
        },
      ],
    }).compile();

    service = module.get(DashboardService);
  }

  /** The [start, endExclusive] bound pair the service passed to Postgres. */
  function boundsPassedToPostgres(): [Date, Date] {
    // Narrowed once, here: jest types the recorded arguments as `any[]`.
    const calls = query.mock.calls as [string, [Date, Date]][];
    return calls[0][1];
  }

  it('should convert a custom range into a half-open window in local time', async () => {
    await buildService(EMPTY_ROW);

    await service.summary({ from: '2026-07-10', to: '2026-07-15' });

    const [start, endExclusive] = boundsPassedToPostgres();
    expect(start.toISOString()).toBe('2026-07-09T18:00:00.000Z');
    // Start of 16 July locally, so all of the 15th counts.
    expect(endExclusive.toISOString()).toBe('2026-07-15T18:00:00.000Z');
  });

  it('should echo back the window it measured', async () => {
    await buildService(EMPTY_ROW);

    const summary = await service.summary({
      from: '2026-07-10',
      to: '2026-07-15',
    });

    expect(summary.period).toEqual({ from: '2026-07-10', to: '2026-07-15' });
  });

  it('should coerce the string columns pg returns into numbers', async () => {
    await buildService({
      total_earning: '45250.00',
      total_transactions: '58',
      total_units_sold: '320',
      distinct_products_sold: '74',
    });

    const summary = await service.summary({
      from: '2026-07-10',
      to: '2026-07-15',
    });

    expect(summary).toEqual({
      period: { from: '2026-07-10', to: '2026-07-15' },
      total_earning: 45250,
      total_units_sold: 320,
      total_transactions: 58,
      distinct_products_sold: 74,
    });
  });

  it('should report zeroes rather than nulls for a period with no sales', async () => {
    await buildService(EMPTY_ROW);

    const summary = await service.summary({ period: 'today' });

    expect(summary.total_earning).toBe(0);
    expect(summary.total_units_sold).toBe(0);
    expect(summary.total_transactions).toBe(0);
    expect(summary.distinct_products_sold).toBe(0);
  });

  it('should keep the money at the sale grain, not multiply it by line count', async () => {
    // Guards the reason the aggregate uses two CTEs: a plain sales-to-items
    // join would return the total once per line and inflate the earnings.
    await buildService({
      total_earning: '100.00',
      total_transactions: '1',
      total_units_sold: '3',
      distinct_products_sold: '3',
    });

    const summary = await service.summary({
      from: '2026-07-10',
      to: '2026-07-10',
    });

    expect(summary.total_earning).toBe(100);
    expect(summary.total_units_sold).toBe(3);
  });

  it('should default to today when neither a period nor a range is given', async () => {
    await buildService(EMPTY_ROW);

    const summary = await service.summary({});

    expect(summary.period.from).toBe(summary.period.to);
  });

  it('should let an explicit range override a period', async () => {
    await buildService(EMPTY_ROW);

    const summary = await service.summary({
      period: 'this_month',
      from: '2026-07-10',
      to: '2026-07-15',
    });

    expect(summary.period).toEqual({ from: '2026-07-10', to: '2026-07-15' });
  });

  it('should reject a range missing its other half', async () => {
    await buildService(EMPTY_ROW);

    await expect(service.summary({ from: '2026-07-10' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.summary({ to: '2026-07-15' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject a backwards range instead of silently returning zero', async () => {
    await buildService(EMPTY_ROW);

    await expect(
      service.summary({ from: '2026-07-15', to: '2026-07-10' }),
    ).rejects.toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('should accept a single-day range where from equals to', async () => {
    await buildService(EMPTY_ROW);

    await service.summary({ from: '2026-07-10', to: '2026-07-10' });

    const [start, endExclusive] = boundsPassedToPostgres();
    expect(endExclusive.getTime() - start.getTime()).toBe(24 * 3_600_000);
  });
});
