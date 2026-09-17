import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { fromMinorUnits, toMinorUnits } from '../../common/money';
import { ExpiringItemDto } from './dto/expiring-item.dto';
import { StockBatch } from './entities/stock-batch.entity';

/**
 * Read-only views over batches for the expiry worklist. "Today" is the
 * database's CURRENT_DATE, which the deployment keeps on Asia/Dhaka.
 */
@Injectable()
export class ExpiryService {
  constructor(
    @InjectRepository(StockBatch)
    private readonly batchesRepository: Repository<StockBatch>,
  ) {}

  /** Batches with stock that expire within `days`, soonest first. */
  async expiring(days: number): Promise<ExpiringItemDto[]> {
    return this.query(
      'b.expiry_date >= CURRENT_DATE AND b.expiry_date <= CURRENT_DATE + :days::int',
      { days },
    );
  }

  /** Batches with stock that are already past their date. */
  async expired(): Promise<ExpiringItemDto[]> {
    return this.query('b.expiry_date < CURRENT_DATE', {});
  }

  private async query(
    condition: string,
    params: Record<string, unknown>,
  ): Promise<ExpiringItemDto[]> {
    const rows = await this.batchesRepository
      .createQueryBuilder('b')
      .innerJoinAndSelect('b.variant', 'variant')
      .innerJoinAndSelect('variant.product', 'product')
      .innerJoinAndSelect('product.manufacturer', 'manufacturer')
      .addSelect('(b.expiry_date - CURRENT_DATE)', 'days_left')
      .where('b.quantity > 0')
      .andWhere('b.expiry_date IS NOT NULL')
      .andWhere(condition, params)
      .orderBy('b.expiry_date', 'ASC')
      .addOrderBy('b.id', 'ASC')
      .getRawAndEntities();

    return rows.entities.map((batch, i) => {
      const raw = rows.raw[i] as { days_left: string | number };
      return {
        batch_id: batch.id,
        variant_id: batch.variantId,
        brand_name: batch.variant.product.brandName,
        dosage_form: batch.variant.dosageForm,
        strength: batch.variant.strength,
        manufacturer: batch.variant.product.manufacturer.name,
        batch_no: batch.batchNo,
        expiry_date: batch.expiryDate!,
        days_left: Number(raw.days_left),
        quantity: batch.quantity,
        base_unit: batch.variant.baseUnit,
        value_at_cost:
          batch.costPrice === null
            ? null
            : fromMinorUnits(toMinorUnits(batch.costPrice) * batch.quantity),
      };
    });
  }
}
