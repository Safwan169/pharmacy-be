import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginatedDto, paginate } from '../../common/dto/paginated.dto';
import { nextDocumentNumber } from '../../common/document-number';
import { fromMinorUnits, toMinorUnits } from '../../common/money';
import { StockReceipt } from '../stock/entities/stock-receipt.entity';
import { SupplierPayment } from './entities/supplier-payment.entity';
import {
  CreateSupplierPaymentDto,
  DueSupplierDto,
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
    @InjectRepository(SupplierPayment)
    private readonly paymentsRepository: Repository<SupplierPayment>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Everyone the shop owes, longest-outstanding first — the payables worklist. */
  async dueList(): Promise<DueSupplierDto[]> {
    const rows: {
      id: number;
      name: string;
      phone: string | null;
      due_balance: string;
      oldest_due_at: string | null;
      open_receipts: string;
    }[] = await this.dataSource.query(`
      SELECT s.id, s.name, s.phone, s.due_balance,
             MIN(r.received_at)::text AS oldest_due_at,
             COUNT(r.id) AS open_receipts
      FROM suppliers s
      LEFT JOIN stock_receipts r
        ON r.supplier_id = s.id AND r.paid_amount < r.total_cost
      WHERE s.due_balance > 0
      GROUP BY s.id
      ORDER BY oldest_due_at ASC NULLS LAST, s.due_balance DESC
    `);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      due_balance: Number(r.due_balance),
      oldest_due_at: r.oldest_due_at,
      open_receipts: Number(r.open_receipts),
    }));
  }

  async history(id: number): Promise<{ receipts: StockReceipt[]; payments: SupplierPayment[] }> {
    await this.findOne(id);
    const receipts = await this.dataSource
      .getRepository(StockReceipt)
      .createQueryBuilder('receipt')
      .where('receipt.supplierId = :id', { id })
      .orderBy('receipt.receivedAt', 'DESC')
      .addOrderBy('receipt.id', 'DESC')
      .take(50)
      .getMany();
    const payments = await this.paymentsRepository.find({
      where: { supplierId: id },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return { receipts, payments };
  }

  /** Pays down the balance; the oldest unpaid deliveries are settled first. */
  async recordPayment(
    supplierId: number,
    dto: CreateSupplierPaymentDto,
    userId: number,
  ): Promise<SupplierPayment> {
    const id = await this.dataSource.transaction(async (manager) => {
      const supplier = await manager.findOne(Supplier, {
        where: { id: supplierId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!supplier) throw new NotFoundException(`Supplier ${supplierId} not found`);

      const owedMinor = toMinorUnits(supplier.dueBalance);
      const paidMinor = toMinorUnits(dto.amount);
      if (paidMinor > owedMinor) {
        throw new BadRequestException({
          message: `You only owe ${fromMinorUnits(owedMinor).toFixed(2)}. Enter that or less.`,
          reason: 'overpayment',
          due_balance: fromMinorUnits(owedMinor),
        });
      }

      const balanceAfter = fromMinorUnits(owedMinor - paidMinor);
      await manager.update(Supplier, { id: supplierId }, { dueBalance: balanceAfter });

      let remaining = paidMinor;
      const open = await manager
        .createQueryBuilder(StockReceipt, 'receipt')
        .where('receipt.supplierId = :supplierId', { supplierId })
        .andWhere('receipt.paidAmount < receipt.totalCost')
        .orderBy('receipt.receivedAt', 'ASC')
        .addOrderBy('receipt.id', 'ASC')
        .getMany();
      for (const receipt of open) {
        if (remaining <= 0) break;
        const receiptDue = toMinorUnits(receipt.totalCost) - toMinorUnits(receipt.paidAmount);
        const settle = Math.min(receiptDue, remaining);
        await manager.update(
          StockReceipt,
          { id: receipt.id },
          { paidAmount: fromMinorUnits(toMinorUnits(receipt.paidAmount) + settle) },
        );
        remaining -= settle;
      }

      const payment = await manager.save(
        manager.create(SupplierPayment, {
          supplierId,
          receiptId: null,
          paymentNumber: await nextDocumentNumber(manager, 'SPY'),
          amount: fromMinorUnits(paidMinor),
          method: dto.method,
          reference: dto.reference?.trim() || null,
          note: dto.note?.trim() || null,
          balanceAfter,
          createdById: userId,
        }),
      );
      return payment.id;
    });
    return this.paymentsRepository.findOneOrFail({ where: { id } });
  }

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
