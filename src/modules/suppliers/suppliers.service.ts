import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedDto, paginate } from '../../common/dto/paginated.dto';
import {
  CreateSupplierDto,
  ListSuppliersQueryDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { Supplier } from './entities/supplier.entity';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly suppliersRepository: Repository<Supplier>,
  ) {}

  async findAll(query: ListSuppliersQueryDto): Promise<PaginatedDto<Supplier>> {
    const qb = this.suppliersRepository.createQueryBuilder('supplier');
    if (query.search !== undefined) {
      qb.andWhere('(supplier.name ILIKE :search OR supplier.phone ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.status === 'inactive') {
      qb.andWhere('supplier.isActive = false');
    } else if (query.status !== 'all') {
      qb.andWhere('supplier.isActive = true');
    }
    qb.orderBy('supplier.name', 'ASC').skip(query.skip).take(query.limit);
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: number): Promise<Supplier> {
    const supplier = await this.suppliersRepository.findOne({ where: { id } });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${id} not found`);
    }
    return supplier;
  }

  async create(dto: CreateSupplierDto): Promise<Supplier> {
    const name = dto.name.trim();
    const existing = await this.suppliersRepository.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException(`A supplier named "${name}" already exists.`);
    }
    return this.suppliersRepository.save(
      this.suppliersRepository.create({
        name,
        phone: dto.phone?.trim() || null,
        address: dto.address?.trim() || null,
      }),
    );
  }

  async update(id: number, dto: UpdateSupplierDto): Promise<Supplier> {
    const supplier = await this.findOne(id);
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const clash = await this.suppliersRepository.findOne({ where: { name } });
      if (clash && clash.id !== id) {
        throw new ConflictException(`A supplier named "${name}" already exists.`);
      }
      supplier.name = name;
    }
    if (dto.phone !== undefined) supplier.phone = dto.phone?.trim() || null;
    if (dto.address !== undefined) supplier.address = dto.address?.trim() || null;
    if (dto.is_active !== undefined) supplier.isActive = dto.is_active;
    return this.suppliersRepository.save(supplier);
  }
}
