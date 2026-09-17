import {
  BadRequestException,
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
import {
  BaseUnit,
  UnitTemplateRow,
  baseUnitForDosageForm,
  unitTemplate,
} from './base-unit';
import { ListVariantsQueryDto } from './dto/list-variants-query.dto';
import { UnitInputDto, UpdatePricingDto } from './dto/update-pricing.dto';
import { ProductVariant } from './entities/product-variant.entity';
import { VariantUnit } from './entities/variant-unit.entity';

@Injectable()
export class ProductVariantsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ProductVariant)
    private readonly variantsRepository: Repository<ProductVariant>,
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

    if (query.search !== undefined) {
      qb.andWhere(
        '(product.brandName ILIKE :search OR generic.name ILIKE :search)',
        { search: `%${query.search}%` },
      );
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

    qb.orderBy('product.brandName', 'ASC')
      .addOrderBy('variant.id', 'ASC')
      .addOrderBy('unit.sortOrder', 'ASC')
      .skip(query.skip)
      .take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: number): Promise<ProductVariant> {
    const variant = await this.baseQuery()
      .where('variant.id = :id', { id })
      .orderBy('unit.sortOrder', 'ASC')
      .getOne();

    if (!variant) {
      throw new NotFoundException(`Product variant ${id} not found`);
    }
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
  ): Promise<ProductVariant> {
    // An empty body would otherwise save nothing and still answer 200, which
    // reads as a successful update. See UpdatePricingDto for why this isn't a
    // class-validator constraint.
    if (
      dto.price === undefined &&
      dto.stock_quantity === undefined &&
      dto.units === undefined
    ) {
      throw new BadRequestException(
        'Send at least one of price, stock_quantity or units.',
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

      let priceTouched = false;
      if (dto.units !== undefined) {
        await this.replaceLadder(manager, variant, dto.units);
        priceTouched = true;
      } else if (dto.price !== undefined) {
        await this.setBasePrice(manager, variant, dto.price);
        priceTouched = true;
      }

      const patch: Partial<ProductVariant> = {};
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
      if (dto.stock_quantity !== undefined) {
        patch.stockQuantity = dto.stock_quantity;
      }
      await manager.update(ProductVariant, { id }, patch);
    });

    return this.findOne(id);
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
  async deactivate(id: number): Promise<ProductVariant> {
    return this.setActive(id, false);
  }

  /** Puts a withdrawn SKU back in the catalogue. */
  async restore(id: number): Promise<ProductVariant> {
    return this.setActive(id, true);
  }

  private async setActive(
    id: number,
    isActive: boolean,
  ): Promise<ProductVariant> {
    const variant = await this.variantsRepository.findOne({ where: { id } });
    if (!variant) {
      throw new NotFoundException(`Product variant ${id} not found`);
    }

    await this.variantsRepository.update({ id }, { isActive });

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
