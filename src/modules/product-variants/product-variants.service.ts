import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { PaginatedDto, paginate } from '../../common/dto/paginated.dto';
import { ListVariantsQueryDto } from './dto/list-variants-query.dto';
import { UpdatePricingDto } from './dto/update-pricing.dto';
import { ProductVariant } from './entities/product-variant.entity';

@Injectable()
export class ProductVariantsService {
  constructor(
    @InjectRepository(ProductVariant)
    private readonly variantsRepository: Repository<ProductVariant>,
  ) {}

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
      .skip(query.skip)
      .take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: number): Promise<ProductVariant> {
    const variant = await this.baseQuery()
      .where('variant.id = :id', { id })
      .getOne();

    if (!variant) {
      throw new NotFoundException(`Product variant ${id} not found`);
    }
    return variant;
  }

  /**
   * The admin's per-SKU pricing action, and the restock action — either field
   * can be sent on its own, so a restock need not resend an unchanged price.
   */
  async updatePricing(
    id: number,
    dto: UpdatePricingDto,
  ): Promise<ProductVariant> {
    // An empty body would otherwise save nothing and still answer 200, which
    // reads as a successful update. See UpdatePricingDto for why this isn't a
    // class-validator constraint.
    if (dto.price === undefined && dto.stock_quantity === undefined) {
      throw new BadRequestException(
        'Send at least one of price or stock_quantity.',
      );
    }

    const variant = await this.variantsRepository.findOne({ where: { id } });
    if (!variant) {
      throw new NotFoundException(`Product variant ${id} not found`);
    }

    if (dto.price !== undefined) {
      variant.price = dto.price;
      // Only stamped when the price itself moved. Stamping on a stock-only
      // restock would claim the price was reconfirmed when nobody looked at it.
      variant.priceUpdatedAt = new Date();
    }
    if (dto.stock_quantity !== undefined) {
      variant.stockQuantity = dto.stock_quantity;
    }
    await this.variantsRepository.save(variant);

    return this.findOne(id);
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

    variant.isActive = isActive;
    await this.variantsRepository.save(variant);

    return this.findOne(id);
  }

  private baseQuery(): SelectQueryBuilder<ProductVariant> {
    return this.variantsRepository
      .createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .innerJoinAndSelect('product.manufacturer', 'manufacturer')
      .leftJoinAndSelect('variant.generic', 'generic');
  }
}
