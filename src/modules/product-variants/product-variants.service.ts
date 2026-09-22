import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { PaginatedDto, paginate } from '../../common/dto/paginated.dto';
import { fromMinorUnits, toMinorUnits } from '../../common/money';
import { StockService } from '../stock/stock.service';
import { AuditService } from '../audit/audit.service';
import { BulkPriceDto, BulkPricePreviewDto } from './dto/bulk-price.dto';
import {
  BaseUnit,
  UnitTemplateRow,
  baseUnitForDosageForm,
  unitTemplate,
} from './base-unit';
import { ListVariantsQueryDto } from './dto/list-variants-query.dto';
import { UpdatePricingDto, UnitInputDto } from './dto/update-pricing.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { Product } from '../products/entities/product.entity';
import { Manufacturer } from '../manufacturers/entities/manufacturer.entity';
import { Generic } from '../generics/entities/generic.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { VariantUnit } from './entities/variant-unit.entity';

@Injectable()
export class ProductVariantsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ProductVariant)
    private readonly variantsRepository: Repository<ProductVariant>,
    private readonly stockService: StockService,
    private readonly auditService: AuditService,
  ) {}

  /** Suggested unit ladder for a SKU that hasn't been set up yet. */
  unitTemplates(
    dosageForm: string | undefined,
    packSize: number | undefined,
  ): { base_unit: BaseUnit; units: UnitTemplateRow[] } {
    const baseUnit = baseUnitForDosageForm(dosageForm ?? '');
    return {
      base_unit: baseUnit,
      units: unitTemplate(baseUnit, packSize ?? null),
    };
  }

  async findAll(
    query: ListVariantsQueryDto,
  ): Promise<PaginatedDto<ProductVariant>> {
    const qb = this.baseQuery();

    const term = query.search?.trim();
    if (term) {
      // Brand matches come before ingredient matches, and "Napa" itself before
      // "Lonapam" or anything containing "Napadisylate" — otherwise the
      // medicine typed at the counter can fall off the first page.
      qb.andWhere(
        '(product.brandName ILIKE :search OR generic.name ILIKE :search)',
        { search: `%${term}%` },
      )
        .addSelect(
          `CASE
            WHEN product.brandName ILIKE :exact THEN 0
            WHEN product.brandName ILIKE :prefix THEN 1
            WHEN product.brandName ILIKE :search THEN 2
            ELSE 3
          END`,
          'search_rank',
        )
        .setParameters({ exact: term, prefix: `${term}%` })
        .orderBy('search_rank', 'ASC')
        .addOrderBy('product.brandName', 'ASC');
    } else {
      qb.orderBy('product.brandName', 'ASC');
    }
    if (query.manufacturer_id !== undefined) {
      qb.andWhere('product.manufacturerId = :manufacturerId', {
        manufacturerId: query.manufacturer_id,
      });
    }
    if (query.generic_id !== undefined) {
      qb.andWhere('variant.genericId = :genericId', {
        genericId: query.generic_id,
      });
    }
    if (query.dosage_form !== undefined) {
      qb.andWhere('variant.dosageForm = :dosageForm', {
        dosageForm: query.dosage_form,
      });
    }
    if (query.type !== undefined) {
      qb.andWhere('product.type = :type', { type: query.type });
    }
    if (query.pricing_status === 'missing') {
      // Matches the partial index idx_variants_price_null.
      qb.andWhere('variant.price IS NULL');
    } else if (query.pricing_status === 'set') {
      qb.andWhere('variant.price IS NOT NULL');
    }
    // Withdrawn SKUs are hidden unless asked for by name, so every caller that
    // doesn't know about soft delete — including /generics/:id/variants, which
    // delegates here — gets the active catalogue by default.
    if (query.status === 'inactive') {
      qb.andWhere('variant.isActive = false');
    } else if (query.status !== 'all') {
      qb.andWhere('variant.isActive = true');
    }

    qb.addOrderBy('variant.id', 'ASC')
      .addOrderBy('unit.sortOrder', 'ASC')
      .skip(query.skip)
      .take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  /**
   * Adds a medicine by hand. Company, ingredient and brand line are reused
   * when they already exist (matched ignoring case and surrounding spaces),
   * so the manual path can't fork the catalogue the importer maintains.
   */
  async create(dto: CreateVariantDto): Promise<ProductVariant> {
    const brandName = dto.brand_name.trim();
    const manufacturerName = dto.manufacturer_name.trim();
    const genericName = dto.generic_name?.trim() || null;
    const dosageForm = dto.dosage_form.trim();
    const strength = dto.strength?.trim() || null;

    const id = await this.dataSource.transaction(async (manager) => {
      let manufacturer = await manager
        .createQueryBuilder(Manufacturer, 'm')
        .where('LOWER(m.name) = LOWER(:name)', { name: manufacturerName })
        .getOne();
      if (!manufacturer) {
        manufacturer = await manager.save(
          manager.create(Manufacturer, { name: manufacturerName }),
        );
      }

      let generic: Generic | null = null;
      if (genericName) {
        generic = await manager
          .createQueryBuilder(Generic, 'g')
          .where('LOWER(g.name) = LOWER(:name)', { name: genericName })
          .getOne();
        if (!generic) {
          generic = await manager.save(
            manager.create(Generic, { name: genericName }),
          );
        }
      }

      let product = await manager
        .createQueryBuilder(Product, 'p')
        .where('LOWER(p.brandName) = LOWER(:name)', { name: brandName })
        .andWhere('p.manufacturerId = :manufacturerId', {
          manufacturerId: manufacturer.id,
        })
        .getOne();
      if (!product) {
        product = await manager.save(
          manager.create(Product, {
            brandName,
            manufacturerId: manufacturer.id,
            type: dto.type ?? 'allopathic',
          }),
        );
      }

      const duplicate = await manager
        .createQueryBuilder(ProductVariant, 'v')
        .where('v.productId = :productId', { productId: product.id })
        .andWhere('LOWER(v.dosageForm) = LOWER(:form)', { form: dosageForm })
        .andWhere(
          strength === null
            ? 'v.strength IS NULL'
            : 'LOWER(v.strength) = LOWER(:strength)',
          { strength },
        )
        .getOne();
      if (duplicate) {
        throw new ConflictException({
          message: `${brandName} ${strength ?? ''} ${dosageForm} already exists`,
          reason: 'variant_exists',
          variant_id: duplicate.id,
        });
      }

      const variant = await manager.save(
        manager.create(ProductVariant, {
          productId: product.id,
          genericId: generic?.id ?? null,
          dosageForm,
          strength,
          slug: null,
          legacyBrandId: null,
          baseUnit: baseUnitForDosageForm(dosageForm),
          packSize: dto.pack_size ?? null,
          price: null,
          stockQuantity: null,
          isActive: true,
        }),
      );
      return variant.id;
    });

    return this.findOne(id);
  }

  async findOne(id: number): Promise<ProductVariant> {
    const variant = await this.baseQuery()
      .where('variant.id = :id', { id })
      .orderBy('unit.sortOrder', 'ASC')
      .getOne();

    if (!variant) {
      throw new NotFoundException(`Product variant ${id} not found`);
    }
    variant.batches = await this.stockService.batchesForVariant(id);
    return variant;
  }

  /**
   * The admin's per-SKU pricing action, and the restock action — any field
   * can be sent on its own, so a restock need not resend an unchanged ladder.
   *
   * `units` replaces the whole ladder. `variant.price` is kept equal to the
   * default unit's price so the worklist (`pricing_status`) and the catalogue
   * listing keep working off one column.
   */
  async updatePricing(
    id: number,
    dto: UpdatePricingDto,
    userId: number | null = null,
  ): Promise<ProductVariant> {
    // An empty body would otherwise save nothing and still answer 200, which
    // reads as a successful update. See UpdatePricingDto for why this isn't a
    // class-validator constraint.
    if (
      dto.price === undefined &&
      dto.stock_quantity === undefined &&
      dto.units === undefined &&
      dto.reorder_level === undefined
    ) {
      throw new BadRequestException(
        'Send at least one of price, stock_quantity, units or reorder_level.',
      );
    }
    if (dto.units !== undefined) {
      validateLadder(dto.units);
    }

    await this.dataSource.transaction(async (manager) => {
      const variant = await manager.findOne(ProductVariant, {
        where: { id },
      });
      if (!variant) {
        throw new NotFoundException(`Product variant ${id} not found`);
      }

      const before = await manager.find(VariantUnit, {
        where: { variantId: id },
        order: { sortOrder: 'ASC' },
      });
      const label = await this.labelFor(manager, variant);

      let priceTouched = false;
      if (dto.units !== undefined) {
        await this.replaceLadder(manager, variant, dto.units);
        priceTouched = true;
      } else if (dto.price !== undefined) {
        await this.setBasePrice(manager, variant, dto.price);
        priceTouched = true;
      }

      const patch: Partial<ProductVariant> = {};
      if (dto.reorder_level !== undefined) {
        patch.reorderLevel = dto.reorder_level;
      }
      if (priceTouched) {
        const units = await manager.find(VariantUnit, {
          where: { variantId: id },
          order: { sortOrder: 'ASC' },
        });
        const shown = units.find((u) => u.isDefault) ?? units[0];
        patch.price = shown?.price ?? null;
        // Only stamped when a price moved. Stamping on a stock-only restock
        // would claim the price was reconfirmed when nobody looked at it.
        patch.priceUpdatedAt = new Date();
      }
      if (Object.keys(patch).length > 0) {
        await manager.update(ProductVariant, { id }, patch);
      }
      if (priceTouched) {
        const after = await manager.find(VariantUnit, {
          where: { variantId: id },
          order: { sortOrder: 'ASC' },
        });
        const changes = describeLadderChange(before, after);
        if (changes.length > 0) {
          await this.auditService.record(
            {
              userId,
              action: 'price.update',
              entityType: 'variant',
              entityId: id,
              summary: `${label}: ${changes.join(', ')}`,
              details: {
                before: before.map(unitSnapshot),
                after: after.map(unitSnapshot),
              },
            },
            manager,
          );
        }
      }
      if (dto.reorder_level !== undefined && dto.reorder_level !== variant.reorderLevel) {
        await this.auditService.record(
          {
            userId,
            action: 'reorder.update',
            entityType: 'variant',
            entityId: id,
            summary: `${label}: reorder level ${variant.reorderLevel ?? 'default'} → ${dto.reorder_level ?? 'default'}`,
          },
          manager,
        );
      }
      // "Set stock to N" is a count correction: the difference is booked as an
      // adjustment against batches so the ledger and batch totals stay honest.
      if (dto.stock_quantity !== undefined) {
        await this.stockService.adjustToCount(
          manager,
          id,
          dto.stock_quantity,
          userId,
          dto.stock_note,
        );
        if (dto.stock_quantity !== variant.stockQuantity) {
          await this.auditService.record(
            {
              userId,
              action: 'stock.adjust',
              entityType: 'variant',
              entityId: id,
              summary: `${label}: stock ${variant.stockQuantity ?? 'uncounted'} → ${dto.stock_quantity} ${variant.baseUnit}${dto.stock_note ? ` (${dto.stock_note})` : ''}`,
            },
            manager,
          );
        }
      }
    });

    return this.findOne(id);
  }

  /** "Napa 500 mg" — for audit lines, so nobody has to look an id up. */
  private async labelFor(manager: EntityManager, variant: ProductVariant): Promise<string> {
    const product = await manager.findOne(Product, { where: { id: variant.productId } });
    return `${product?.brandName ?? `#${variant.id}`}${variant.strength ? ` ${variant.strength}` : ''}`;
  }

  /**
   * Changes every priced, sellable unit of the matching SKUs by a percentage
   * or a fixed amount, rounded to `round_to`. `dry_run` only counts and shows
   * a sample, so the owner sees what "+5% for Square" really does first.
   */
  async bulkPrice(dto: BulkPriceDto, userId: number): Promise<BulkPricePreviewDto> {
    if ((dto.percent === undefined) === (dto.amount === undefined)) {
      throw new BadRequestException('Send exactly one of percent or amount.');
    }
    const qb = this.variantsRepository
      .createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .innerJoinAndSelect('variant.units', 'unit', 'unit.price IS NOT NULL')
      .leftJoin('variant.generic', 'generic')
      .where('variant.isActive = true');
    if (dto.manufacturer_id !== undefined) {
      qb.andWhere('product.manufacturerId = :m', { m: dto.manufacturer_id });
    }
    if (dto.generic_id !== undefined) {
      qb.andWhere('variant.genericId = :g', { g: dto.generic_id });
    }
    if (dto.search) {
      qb.andWhere('(product.brandName ILIKE :s OR generic.name ILIKE :s)', { s: `%${dto.search.trim()}%` });
    }
    if (dto.manufacturer_id === undefined && dto.generic_id === undefined && !dto.search) {
      throw new BadRequestException({
        message: 'Narrow it down: pick a company, an ingredient or a search term.',
        reason: 'filter_required',
      });
    }
    const variants = await qb.orderBy('product.brandName', 'ASC').addOrderBy('unit.sortOrder', 'ASC').getMany();

    const step = Math.round((dto.round_to ?? 0.5) * 100) || 1;
    const rounded = (minor: number) => Math.round(minor / step) * step;
    // A fixed amount is per base unit (tablet, capsule…): a strip of 10 moves 10x.
    const next = (oldMinor: number, qtyInBase: number) =>
      Math.max(
        0,
        rounded(
          dto.percent !== undefined
            ? Math.round(oldMinor * (1 + dto.percent / 100))
            : oldMinor + toMinorUnits(dto.amount as number) * qtyInBase,
        ),
      );

    const rows: { variant_id: number; name: string; unit: string; old_price: number; new_price: number }[] = [];
    for (const v of variants) {
      const name = `${v.product.brandName}${v.strength ? ` ${v.strength}` : ''}`;
      for (const u of v.units) {
        const oldMinor = toMinorUnits(u.price as number);
        const newMinor = next(oldMinor, u.qtyInBase);
        if (newMinor !== oldMinor) {
          rows.push({ variant_id: v.id, name, unit: u.name, old_price: u.price as number, new_price: fromMinorUnits(newMinor) });
        }
      }
    }
    const variantIds = [...new Set(rows.map((r) => r.variant_id))];

    if (!dto.dry_run && rows.length > 0) {
      await this.dataSource.transaction(async (manager) => {
        for (const v of variants) {
          let touched = false;
          for (const u of v.units) {
            const row = rows.find((r) => r.variant_id === v.id && r.unit === u.name);
            if (!row) continue;
            await manager.update(VariantUnit, { id: u.id }, { price: row.new_price });
            touched = true;
          }
          if (touched) {
            const shown = v.units.find((u) => u.isDefault) ?? v.units[0];
            const shownRow = shown && rows.find((r) => r.variant_id === v.id && r.unit === shown.name);
            await manager.update(
              ProductVariant,
              { id: v.id },
              { price: shownRow ? shownRow.new_price : (shown?.price ?? null), priceUpdatedAt: new Date() },
            );
          }
        }
        await this.auditService.record(
          {
            userId,
            action: 'price.bulk',
            entityType: 'catalogue',
            summary: `Bulk price change ${dto.percent !== undefined ? `${dto.percent > 0 ? '+' : ''}${dto.percent}%` : `${(dto.amount as number) > 0 ? '+' : ''}${dto.amount}`} on ${variantIds.length} medicines (${rows.length} unit prices)`,
            details: {
              filter: { manufacturer_id: dto.manufacturer_id, generic_id: dto.generic_id, search: dto.search },
              percent: dto.percent,
              amount: dto.amount,
              round_to: dto.round_to ?? 0.5,
              variant_ids: variantIds,
            },
          },
          manager,
        );
      });
    }

    return {
      dry_run: dto.dry_run !== false,
      variants: variantIds.length,
      unit_prices: rows.length,
      sample: rows.slice(0, 25),
    };
  }

  private async replaceLadder(
    manager: EntityManager,
    variant: ProductVariant,
    units: UnitInputDto[],
  ): Promise<void> {
    const wanted = new Map(
      units.map((u) => [u.name.trim().toLowerCase(), u] as const),
    );
    const existing = await manager.find(VariantUnit, {
      where: { variantId: variant.id },
    });

    for (const row of existing) {
      if (!wanted.has(row.name)) {
        await manager.remove(row);
      }
    }

    let sortOrder = 0;
    for (const [name, input] of wanted) {
      const row =
        existing.find((u) => u.name === name) ??
        manager.create(VariantUnit, { variantId: variant.id, name });
      row.qtyInBase = input.qty_in_base;
      row.price = input.price ?? null;
      row.isSellable = input.is_sellable ?? true;
      row.isDefault = input.is_default ?? false;
      row.sortOrder = sortOrder++;
      await manager.save(row);
    }
  }

  /** Legacy shortcut: price the base unit alone, creating its row if needed. */
  private async setBasePrice(
    manager: EntityManager,
    variant: ProductVariant,
    price: number,
  ): Promise<void> {
    let base = await manager.findOne(VariantUnit, {
      where: { variantId: variant.id, qtyInBase: 1 },
    });
    if (!base) {
      const others = await manager.count(VariantUnit, {
        where: { variantId: variant.id },
      });
      base = manager.create(VariantUnit, {
        variantId: variant.id,
        name: variant.baseUnit,
        qtyInBase: 1,
        isSellable: true,
        isDefault: others === 0,
        sortOrder: 0,
      });
    }
    base.price = price;
    await manager.save(base);
  }

  /**
   * Withdraws a SKU from the catalogue. Deliberately not a hard DELETE: a
   * variant that has been sold is referenced by `sale_items`, and removing the
   * row would either fail on the foreign key or, if that were relaxed, destroy
   * the lines a past invoice renders from. Deactivating is reversible and safe
   * whether or not the SKU has ever sold.
   *
   * Idempotent — deactivating an already-inactive variant is a no-op, not an error.
   */
  async deactivate(id: number, userId: number | null = null): Promise<ProductVariant> {
    return this.setActive(id, false, userId);
  }

  /** Puts a withdrawn SKU back in the catalogue. */
  async restore(id: number, userId: number | null = null): Promise<ProductVariant> {
    return this.setActive(id, true, userId);
  }

  private async setActive(
    id: number,
    isActive: boolean,
    userId: number | null,
  ): Promise<ProductVariant> {
    const variant = await this.variantsRepository.findOne({ where: { id } });
    if (!variant) {
      throw new NotFoundException(`Product variant ${id} not found`);
    }

    await this.variantsRepository.update({ id }, { isActive });
    if (variant.isActive !== isActive) {
      await this.auditService.record({
        userId,
        action: isActive ? 'variant.restore' : 'variant.withdraw',
        entityType: 'variant',
        entityId: id,
        summary: `${await this.labelFor(this.dataSource.manager, variant)}: ${isActive ? 'put back on sale' : 'withdrawn from sale'}`,
      });
    }

    return this.findOne(id);
  }

  private baseQuery(): SelectQueryBuilder<ProductVariant> {
    return this.variantsRepository
      .createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .innerJoinAndSelect('product.manufacturer', 'manufacturer')
      .leftJoinAndSelect('variant.generic', 'generic')
      .leftJoinAndSelect('variant.units', 'unit');
  }
}

/** Ladder rules that span rows, so class-validator can't express them. */
function validateLadder(units: UnitInputDto[]): void {
  const names = units.map((u) => u.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) {
    throw new BadRequestException('Each unit name may appear only once.');
  }
  const defaults = units.filter((u) => u.is_default === true);
  if (defaults.length !== 1) {
    throw new BadRequestException('Exactly one unit must be the default.');
  }
  if (defaults[0].is_sellable === false) {
    throw new BadRequestException('The default unit must be sellable.');
  }
  if (!units.some((u) => u.qty_in_base === 1)) {
    throw new BadRequestException(
      'Include the base unit (qty_in_base = 1), even if it is not sellable.',
    );
  }
  const qtys = units.map((u) => u.qty_in_base);
  if (new Set(qtys).size !== qtys.length) {
    throw new BadRequestException('Two units cannot have the same size.');
  }
}

function unitSnapshot(u: VariantUnit) {
  return { name: u.name, qty_in_base: u.qtyInBase, price: u.price, is_sellable: u.isSellable, is_default: u.isDefault };
}

/** "strip 10.00 → 12.00, box added at 110.00" — the readable part of a price change. */
function describeLadderChange(before: VariantUnit[], after: VariantUnit[]): string[] {
  const fmt = (p: number | null) => (p === null ? '—' : p.toFixed(2));
  const out: string[] = [];
  for (const a of after) {
    const b = before.find((x) => x.name === a.name);
    if (!b) out.push(`${a.name} added at ${fmt(a.price)}`);
    else if (b.price !== a.price) out.push(`${a.name} ${fmt(b.price)} → ${fmt(a.price)}`);
    else if (b.qtyInBase !== a.qtyInBase) out.push(`${a.name} size ${b.qtyInBase} → ${a.qtyInBase}`);
  }
  for (const b of before) {
    if (!after.some((a) => a.name === b.name)) out.push(`${b.name} removed`);
  }
  return out;
}
