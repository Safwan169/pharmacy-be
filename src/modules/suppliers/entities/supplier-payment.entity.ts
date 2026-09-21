import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { User } from '../../auth/entities/user.entity';
import { StockReceipt } from '../../stock/entities/stock-receipt.entity';
import { Supplier } from './supplier.entity';

export const SUPPLIER_PAYMENT_METHODS = ['cash', 'bkash'] as const;
export type SupplierPaymentMethod = (typeof SUPPLIER_PAYMENT_METHODS)[number];

/**
 * Money the shop paid out for stock — at the delivery (receipt_id set) or
 * later against the supplier's balance. Cash purchases with no supplier on
 * record still get a row, so the day's cash-out is complete.
 */
@Entity({ name: 'supplier_payments' })
@Unique('uq_supplier_payments_number', ['paymentNumber'])
@Check('chk_supplier_payments_method', `"method" IN ('cash', 'bkash')`)
@Check('chk_supplier_payments_amount', `"amount" > 0`)
@Index('idx_supplier_payments_supplier', ['supplierId', 'createdAt'])
export class SupplierPayment {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiPropertyOptional({ example: 3, nullable: true })
  @Column({ name: 'supplier_id', type: 'integer', nullable: true })
  supplierId!: number | null;

  @ManyToOne(() => Supplier, { nullable: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier!: Supplier | null;

  @ApiPropertyOptional({ example: 12, nullable: true, description: 'Set when paid at the delivery.' })
  @Column({ name: 'receipt_id', type: 'integer', nullable: true })
  receiptId!: number | null;

  @ManyToOne(() => StockReceipt, { nullable: true })
  @JoinColumn({ name: 'receipt_id' })
  receipt!: StockReceipt | null;

  @ApiProperty({ example: 'SPY-20260921-0001' })
  @Column({ name: 'payment_number', type: 'varchar', length: 30 })
  paymentNumber!: string;

  @ApiProperty({ example: 5000 })
  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  amount!: number;

  @ApiProperty({ enum: SUPPLIER_PAYMENT_METHODS })
  @Column({ type: 'varchar', length: 10 })
  method!: SupplierPaymentMethod;

  @ApiPropertyOptional({ nullable: true, description: 'bKash TrxID, cheque number…' })
  @Column({ type: 'varchar', length: 50, nullable: true })
  reference!: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  note!: string | null;

  @ApiProperty({ example: 7500, description: "The supplier's balance after this payment." })
  @Column({ name: 'balance_after', type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  balanceAfter!: number;

  @Column({ name: 'created_by', type: 'integer' })
  createdById!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User;

  @Index('idx_supplier_payments_created')
  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
