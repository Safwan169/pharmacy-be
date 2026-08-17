import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedDto, paginate } from '../../common/dto/paginated.dto';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepository: Repository<ProductVariant>,
  ) {}

  async findAll(query: ListProductsQueryDto): Promise<PaginatedDto<Product>> {
    const qb = this.productsRepository
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.manufacturer', 'manufacturer');

    if (query.search !== undefined) {
      qb.andWhere('product.brandName ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    if (query.manufacturer_id !== undefined) {
      qb.andWhere('product.manufacturerId = :manufacturerId', {
        manufacturerId: query.manufacturer_id,
      });
    }
    if (query.type !== undefined) {
      qb.andWhere('product.type = :type', { type: query.type });
    }

    qb.orderBy('product.brandName', 'ASC')
      .addOrderBy('product.id', 'ASC')
      .skip(query.skip)
      .take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    await this.attachVariantCounts(data);
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.productsRepository
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.manufacturer', 'manufacturer')
      // Filtered in the JOIN, not the WHERE: as a WHERE clause this would drop
      // the product itself once all of its SKUs had been withdrawn.
      .leftJoinAndSelect('product.variants', 'variant', 'variant.is_active')
      .leftJoinAndSelect('variant.generic', 'generic')
      .where('product.id = :id', { id })
      .orderBy('variant.id', 'ASC')
      .getOne();

    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  /**
   * Fills in `variantCount` for a page of products with one grouped query.
   * TypeORM 1.x dropped `loadRelationCountAndMap`, and joining the variants in
   * would multiply rows and break `skip`/`take`.
   */
  private async attachVariantCounts(products: Product[]): Promise<void> {
    if (products.length === 0) {
      return;
    }

    const rows = await this.variantsRepository
      .createQueryBuilder('variant')
      .select('variant.productId', 'productId')
      .addSelect('COUNT(*)', 'count')
      .where('variant.productId IN (:...ids)', {
        ids: products.map((product) => product.id),
      })
      // Counts only what findOne() will actually list, so the badge on the list
      // screen can't promise more SKUs than the detail screen shows.
      .andWhere('variant.isActive = true')
      .groupBy('variant.productId')
      .getRawMany<{ productId: number; count: string }>();

    const counts = new Map(
      rows.map((row) => [Number(row.productId), Number(row.count)]),
    );
    for (const product of products) {
      product.variantCount = counts.get(product.id) ?? 0;
    }
  }
}
