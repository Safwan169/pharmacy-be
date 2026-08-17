import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdatePricingDto } from './dto/update-pricing.dto';
import { ProductVariant } from './entities/product-variant.entity';
import { ProductVariantsService } from './product-variants.service';

function buildVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 1,
    price: 40.12,
    stockQuantity: 250,
    priceUpdatedAt: new Date('2026-01-01T00:00:00Z'),
    isActive: true,
    ...overrides,
  } as ProductVariant;
}

describe('ProductVariantsService — updatePricing', () => {
  let service: ProductVariantsService;
  let saved: ProductVariant;
  let repository: {
    findOne: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  async function buildService(variant: ProductVariant | null): Promise<void> {
    repository = {
      findOne: jest.fn().mockResolvedValue(variant),
      save: jest.fn().mockImplementation((entity: ProductVariant) => {
        saved = entity;
        return Promise.resolve(entity);
      }),
      // updatePricing re-reads through findOne(), which uses the query builder.
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockImplementation(() => Promise.resolve(saved)),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductVariantsService,
        { provide: getRepositoryToken(ProductVariant), useValue: repository },
      ],
    }).compile();

    service = module.get(ProductVariantsService);
  }

  it('should update both fields when both are sent', async () => {
    await buildService(buildVariant());

    await service.updatePricing(1, { price: 55.5, stock_quantity: 10 });

    expect(saved.price).toBe(55.5);
    expect(saved.stockQuantity).toBe(10);
  });

  it('should leave the price alone when only stock is sent', async () => {
    await buildService(buildVariant({ price: 40.12 }));

    await service.updatePricing(1, { stock_quantity: 10 });

    expect(saved.price).toBe(40.12);
    expect(saved.stockQuantity).toBe(10);
  });

  it('should leave the stock alone when only price is sent', async () => {
    await buildService(buildVariant({ stockQuantity: 250 }));

    await service.updatePricing(1, { price: 55.5 });

    expect(saved.stockQuantity).toBe(250);
    expect(saved.price).toBe(55.5);
  });

  it('should not restamp price_updated_at on a stock-only restock', async () => {
    const stampedAt = new Date('2026-01-01T00:00:00Z');
    await buildService(buildVariant({ priceUpdatedAt: stampedAt }));

    await service.updatePricing(1, { stock_quantity: 10 });

    // Restocking says nothing about whether the price is still right.
    expect(saved.priceUpdatedAt).toBe(stampedAt);
  });

  it('should stamp price_updated_at whenever the price is sent', async () => {
    const stampedAt = new Date('2026-01-01T00:00:00Z');
    await buildService(buildVariant({ priceUpdatedAt: stampedAt }));

    await service.updatePricing(1, { price: 55.5 });

    expect(saved.priceUpdatedAt).not.toBe(stampedAt);
    expect(saved.priceUpdatedAt!.getTime()).toBeGreaterThan(
      stampedAt.getTime(),
    );
  });

  it('should treat a zero stock as confirmed out of stock, not as absent', async () => {
    await buildService(buildVariant({ stockQuantity: 250 }));

    await service.updatePricing(1, { stock_quantity: 0 });

    expect(saved.stockQuantity).toBe(0);
  });

  it('should accept a zero price rather than skipping it as falsy', async () => {
    await buildService(buildVariant({ price: 40.12 }));

    await service.updatePricing(1, { price: 0 });

    expect(saved.price).toBe(0);
  });

  it('should 404 for a variant that does not exist', async () => {
    await buildService(null);

    await expect(service.updatePricing(999, { price: 1 })).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('should reject an empty body instead of answering 200 having changed nothing', async () => {
    await buildService(buildVariant());

    await expect(service.updatePricing(1, {})).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('ProductVariantsService — soft delete', () => {
  let service: ProductVariantsService;
  let saved: ProductVariant;
  let repository: {
    findOne: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  async function buildService(variant: ProductVariant | null): Promise<void> {
    repository = {
      findOne: jest.fn().mockResolvedValue(variant),
      save: jest.fn().mockImplementation((entity: ProductVariant) => {
        saved = entity;
        return Promise.resolve(entity);
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockImplementation(() => Promise.resolve(saved)),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductVariantsService,
        { provide: getRepositoryToken(ProductVariant), useValue: repository },
      ],
    }).compile();

    service = module.get(ProductVariantsService);
  }

  it('should deactivate rather than remove the row', async () => {
    await buildService(buildVariant({ isActive: true }));

    await service.deactivate(1);

    expect(saved.isActive).toBe(false);
    // The row must survive: sale_items references it and invoices render from
    // those lines.
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('should keep price and stock intact through a deactivation', async () => {
    await buildService(
      buildVariant({ isActive: true, price: 40.12, stockQuantity: 250 }),
    );

    await service.deactivate(1);

    expect(saved.price).toBe(40.12);
    expect(saved.stockQuantity).toBe(250);
  });

  it('should treat deactivating an already-withdrawn variant as a no-op', async () => {
    await buildService(buildVariant({ isActive: false }));

    await service.deactivate(1);

    expect(saved.isActive).toBe(false);
  });

  it('should restore a withdrawn variant with its pricing unchanged', async () => {
    await buildService(
      buildVariant({ isActive: false, price: 40.12, stockQuantity: 250 }),
    );

    await service.restore(1);

    expect(saved.isActive).toBe(true);
    expect(saved.price).toBe(40.12);
    expect(saved.stockQuantity).toBe(250);
  });

  it('should 404 when deactivating a variant that does not exist', async () => {
    await buildService(null);

    await expect(service.deactivate(999)).rejects.toThrow(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('should 404 when restoring a variant that does not exist', async () => {
    await buildService(null);

    await expect(service.restore(999)).rejects.toThrow(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('ProductVariantsService — status filter', () => {
  let service: ProductVariantsService;
  let qb: Record<string, jest.Mock>;

  /** Every `andWhere` condition string applied to the list query. */
  function conditions(): string[] {
    // Narrowed once, here: jest types the recorded arguments as `any[]`.
    const calls = qb.andWhere.mock.calls as [string][];
    return calls.map(([condition]) => condition);
  }

  beforeEach(async () => {
    qb = {};
    for (const method of [
      'innerJoinAndSelect',
      'leftJoinAndSelect',
      'andWhere',
      'orderBy',
      'addOrderBy',
      'skip',
      'take',
    ]) {
      qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductVariantsService,
        {
          provide: getRepositoryToken(ProductVariant),
          useValue: { createQueryBuilder: jest.fn().mockReturnValue(qb) },
        },
      ],
    }).compile();

    service = module.get(ProductVariantsService);
  });

  it('should hide withdrawn SKUs by default', async () => {
    await service.findAll({ page: 1, limit: 20, skip: 0 });

    expect(conditions()).toContain('variant.isActive = true');
  });

  it('should show only withdrawn SKUs for status=inactive', async () => {
    await service.findAll({ page: 1, limit: 20, skip: 0, status: 'inactive' });

    expect(conditions()).toContain('variant.isActive = false');
  });

  it('should apply no active filter at all for status=all', async () => {
    await service.findAll({ page: 1, limit: 20, skip: 0, status: 'all' });

    expect(conditions().filter((c) => c.includes('isActive'))).toEqual([]);
  });

  it('should still hide withdrawn SKUs when another filter is combined', async () => {
    await service.findAll({
      page: 1,
      limit: 20,
      skip: 0,
      pricing_status: 'missing',
    });

    expect(conditions()).toContain('variant.isActive = true');
    expect(conditions()).toContain('variant.price IS NULL');
  });
});

describe('ProductVariantsService — UpdatePricingDto validation', () => {
  function validate(body: Record<string, unknown>): string[] {
    const dto = plainToInstance(UpdatePricingDto, body);
    return validateSync(dto).flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
  }

  it('should accept stock on its own', () => {
    expect(validate({ stock_quantity: 10 })).toEqual([]);
  });

  it('should accept price on its own', () => {
    expect(validate({ price: 55.5 })).toEqual([]);
  });

  it('should let an empty body past field validation, leaving it to the service', () => {
    // Both fields are optional, so nothing here fires — the guard that catches
    // this lives in updatePricing(), covered above.
    expect(validate({})).toEqual([]);
  });

  it('should reject a negative price', () => {
    expect(validate({ price: -1 }).length).toBeGreaterThan(0);
  });

  it('should reject a price with more than two decimal places', () => {
    expect(validate({ price: 1.234 }).length).toBeGreaterThan(0);
  });

  it('should reject a fractional stock quantity', () => {
    expect(validate({ stock_quantity: 1.5 }).length).toBeGreaterThan(0);
  });
});
