import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { nextDocumentNumber } from '../../common/document-number';
import { PaginatedDto, paginate } from '../../common/dto/paginated.dto';
import { fromMinorUnits, toMinorUnits } from '../../common/money';
import { Sale } from '../sales/entities/sale.entity';
import {
  CreateCustomerDto,
  CreateDuePaymentDto,
  DueCustomerDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from './dto/customer.dto';
import { Customer, DuePayment } from './entities/customer.entity';

const PAYMENT_PREFIX = 'PAY';

function normalisePhone(phone: string | undefined | null): string | null {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  return digits === '' ? null : digits;
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,
    @InjectRepository(DuePayment)
    private readonly paymentsRepository: Repository<DuePayment>,
  ) {}

  async findAll(query: ListCustomersQueryDto): Promise<PaginatedDto<Customer>> {
    const qb = this.customersRepository
      .createQueryBuilder('c')
      .where('c.isActive = true');
    if (query.search !== undefined) {
      qb.andWhere('(c.name ILIKE :search OR c.phone ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.has_due) {
      qb.andWhere('c.dueBalance > 0');
    }
    qb.orderBy('c.name', 'ASC').skip(query.skip).take(query.limit);
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: number): Promise<Customer> {
    const customer = await this.customersRepository.findOne({ where: { id } });
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    return customer;
  }

  /** Sales and payments for the customer page, newest first. */
  async history(id: number): Promise<{ sales: Sale[]; payments: DuePayment[] }> {
    await this.findOne(id);
    const sales = await this.dataSource
      .getRepository(Sale)
      .createQueryBuilder('sale')
      .where('sale.customerId = :id', { id })
      .orderBy('sale.createdAt', 'DESC')
      .take(50)
      .getMany();
    const payments = await this.paymentsRepository.find({
      where: { customerId: id },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return { sales, payments };
  }

  async create(dto: CreateCustomerDto, manager?: EntityManager): Promise<Customer> {
    const repo = manager ? manager.getRepository(Customer) : this.customersRepository;
    const phone = normalisePhone(dto.phone);
    if (phone) {
      const clash = await repo.findOne({ where: { phone } });
      if (clash) {
        throw new ConflictException({
          message: `${clash.name} already has that phone number.`,
          reason: 'phone_taken',
          customer_id: clash.id,
        });
      }
    }
    return repo.save(
      repo.create({
        name: dto.name.trim(),
        phone,
        address: dto.address?.trim() || null,
        dueBalance: 0,
      }),
    );
  }

  async update(id: number, dto: UpdateCustomerDto): Promise<Customer> {
    const customer = await this.findOne(id);
    if (dto.phone !== undefined) {
      const phone = normalisePhone(dto.phone);
      if (phone) {
        const clash = await this.customersRepository.findOne({ where: { phone } });
        if (clash && clash.id !== id) {
          throw new ConflictException({
            message: `${clash.name} already has that phone number.`,
            reason: 'phone_taken',
          });
        }
      }
      customer.phone = phone;
    }
    if (dto.name !== undefined) customer.name = dto.name.trim();
    if (dto.address !== undefined) customer.address = dto.address?.trim() || null;
    if (dto.is_active !== undefined) {
      if (!dto.is_active && customer.dueBalance > 0) {
        throw new ConflictException({
          message: 'This customer still owes money. Collect it before deactivating them.',
          reason: 'has_due',
        });
      }
      customer.isActive = dto.is_active;
    }
    return this.customersRepository.save(customer);
  }

  /** Everyone who owes, the longest-outstanding first. */
  async dueList(): Promise<DueCustomerDto[]> {
    const rows: {
      id: number;
      name: string;
      phone: string | null;
      due_balance: string;
      oldest_due_at: string | null;
      open_sales: string;
    }[] = await this.dataSource.query(`
      SELECT c.id, c.name, c.phone, c.due_balance,
             MIN(s.created_at) AS oldest_due_at,
             COUNT(s.id) AS open_sales
      FROM customers c
      LEFT JOIN sales s
        ON s.customer_id = c.id AND s.due_amount > 0 AND s.status <> 'voided'
      WHERE c.due_balance > 0
      GROUP BY c.id
      ORDER BY oldest_due_at ASC NULLS LAST, c.due_balance DESC
    `);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      due_balance: Number(r.due_balance),
      oldest_due_at: r.oldest_due_at,
      open_sales: Number(r.open_sales),
    }));
  }

  /**
   * Takes money against the balance. Never below zero — paying more than
   * owed is refused rather than silently kept as credit.
   */
  async recordPayment(
    customerId: number,
    dto: CreateDuePaymentDto,
    userId: number,
  ): Promise<DuePayment> {
    const id = await this.dataSource.transaction(async (manager) => {
      const customer = await manager.findOne(Customer, {
        where: { id: customerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);

      const owedMinor = toMinorUnits(customer.dueBalance);
      const paidMinor = toMinorUnits(dto.amount);
      if (paidMinor > owedMinor) {
        throw new BadRequestException({
          message: `They only owe ${fromMinorUnits(owedMinor).toFixed(2)}. Enter that or less.`,
          reason: 'overpayment',
          due_balance: fromMinorUnits(owedMinor),
        });
      }
      if (dto.sale_id !== undefined) {
        const sale = await manager.findOne(Sale, { where: { id: dto.sale_id } });
        if (!sale || sale.customerId !== customerId) {
          throw new BadRequestException({
            message: 'That sale does not belong to this customer.',
            reason: 'sale_mismatch',
          });
        }
      }

      const balanceAfter = fromMinorUnits(owedMinor - paidMinor);
      await manager.update(Customer, { id: customerId }, { dueBalance: balanceAfter });

      // Settle the oldest open sales first so `due_amount` on each sale stays honest.
      let remaining = paidMinor;
      const open = await manager
        .createQueryBuilder(Sale, 'sale')
        .where('sale.customerId = :customerId', { customerId })
        .andWhere('sale.dueAmount > 0')
        .andWhere("sale.status <> 'voided'")
        .orderBy(dto.sale_id !== undefined ? `CASE WHEN sale.id = ${Number(dto.sale_id)} THEN 0 ELSE 1 END` : 'sale.createdAt', 'ASC')
        .addOrderBy('sale.createdAt', 'ASC')
        .getMany();
      for (const sale of open) {
        if (remaining <= 0) break;
        const saleDueMinor = toMinorUnits(sale.dueAmount);
        const settle = Math.min(saleDueMinor, remaining);
        await manager.update(
          Sale,
          { id: sale.id },
          {
            dueAmount: fromMinorUnits(saleDueMinor - settle),
            paidAmount: fromMinorUnits(toMinorUnits(sale.paidAmount) + settle),
          },
        );
        remaining -= settle;
      }

      const payment = await manager.save(
        manager.create(DuePayment, {
          customerId,
          saleId: dto.sale_id ?? null,
          receiptNumber: await nextDocumentNumber(manager, PAYMENT_PREFIX),
          amount: fromMinorUnits(paidMinor),
          method: dto.method,
          bkashTrxId: dto.bkash_trx_id?.trim() || null,
          note: dto.note?.trim() || null,
          balanceAfter,
          createdById: userId,
        }),
      );
      return payment.id;
    });
    return this.findPayment(id);
  }

  async findPayment(id: number): Promise<DuePayment> {
    const payment = await this.paymentsRepository
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.customer', 'customer')
      .leftJoin('p.createdBy', 'user')
      .addSelect(['user.id', 'user.email', 'user.name'])
      .where('p.id = :id', { id })
      .getOne();
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return payment;
  }
}
