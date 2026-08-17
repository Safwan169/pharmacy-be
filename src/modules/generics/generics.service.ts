import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { PaginatedDto, paginate } from '../../common/dto/paginated.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import { ProductVariantsService } from '../product-variants/product-variants.service';
import { ListGenericsQueryDto } from './dto/list-generics-query.dto';
import { Generic } from './entities/generic.entity';

@Injectable()
export class GenericsService {
  constructor(
    @InjectRepository(Generic)
    private readonly genericsRepository: Repository<Generic>,
    private readonly variantsService: ProductVariantsService,
  ) {}

  async findAll(query: ListGenericsQueryDto): Promise<PaginatedDto<Generic>> {
    const [data, total] = await this.genericsRepository.findAndCount({
      where:
        query.search === undefined ? {} : { name: ILike(`%${query.search}%`) },
      order: { name: 'ASC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginate(data, total, query.page, query.limit);
  }

  /** "Alternative brand" lookup: every SKU built on this active ingredient. */
  async findVariants(
    id: number,
    query: PaginationQueryDto,
  ): Promise<PaginatedDto<ProductVariant>> {
    const exists = await this.genericsRepository.exists({ where: { id } });
    if (!exists) {
      throw new NotFoundException(`Generic ${id} not found`);
    }

    return this.variantsService.findAll({
      page: query.page,
      limit: query.limit,
      skip: query.skip,
      generic_id: id,
    });
  }
}
