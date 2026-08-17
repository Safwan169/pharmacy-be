import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { PaginatedDto, paginate } from '../../common/dto/paginated.dto';
import { ListManufacturersQueryDto } from './dto/list-manufacturers-query.dto';
import { Manufacturer } from './entities/manufacturer.entity';

@Injectable()
export class ManufacturersService {
  constructor(
    @InjectRepository(Manufacturer)
    private readonly manufacturersRepository: Repository<Manufacturer>,
  ) {}

  async findAll(
    query: ListManufacturersQueryDto,
  ): Promise<PaginatedDto<Manufacturer>> {
    const [data, total] = await this.manufacturersRepository.findAndCount({
      where:
        query.search === undefined ? {} : { name: ILike(`%${query.search}%`) },
      order: { name: 'ASC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginate(data, total, query.page, query.limit);
  }
}
