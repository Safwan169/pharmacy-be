import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { User } from '../../auth/entities/user.entity';
import { SaleItem } from './sale-item.entity';
import { SaleReturn } from './sale-return.entity';

export const SALE_STATUSES = [
  'completed',
  'voided',
  'returned',
  'partial_return',
] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const DISCOUNT_TYPES = ['flat', 'percentage'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** Only cash is supported today. Extend the list to add methods — no schema change needed. */
export const PAYMENT_METHODS = ['cash'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

@Entity({ name: 'sales' })
@Unique('uq_sales_invoice_number', ['invoiceNumber'])
@Check('chk_sales_discount_type', `"discount_type" IN ('flat', 'percentage')`)
@Check(
  'chk_sales_status',
  `"status" IN ('completed', 'voided', 'returned', 'partial_return')`,
)
export class Sale {
  @ApiProperty({ example: 42 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: 'INV-20260817-0007' })
  @Column({ name: 'invoice_number', type: 'varchar', length: 50 })
  invoiceNumber!: string;

  @ApiProperty({
    example: 300,
    description: 'Sum of all line totals, before discount.',
  })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  subtotal!: number;

  @ApiPropertyOptional({
    enum: DISCOUNT_TYPES,
    nullable: true,
    description: 'Null when no discount was applied.',
  })
  @Column({
    name: 'discount_type',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  discountType!: DiscountType | null;

  @ApiPropertyOptional({
    example: 10,
    nullable: true,
    description:
      'The raw value entered — 10 means "10%" or "flat 10", per discount_type.',
  })
  @Column({
    name: 'discount_value',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  discountValue!: number | null;

  @ApiProperty({
    example: 30,
    description: 'Currency amount actually deducted.',
  })
  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  discountAmount!: number;

  @ApiProperty({
    example: 270,
    description: 'subtotal - discount_amount. Never negative.',
  })
  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  totalAmount!: number;

  @ApiProperty({ example: 'cash' })
  @Column({
    name: 'payment_method',
    type: 'varchar',
    length: 20,
    default: 'cash',
  })
  paymentMethod!: string;

  @ApiProperty({ example: 1, description: 'Admin who processed the checkout.' })
  @Column({ name: 'created_by', type: 'integer' })
  createdById!: number;

  @ApiPropertyOptional({ type: () => User })
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User;

  @ApiProperty({ type: () => SaleItem, isArray: true })
  @OneToMany(() => SaleItem, (item) => item.sale, { cascade: ['insert'] })
  items!: SaleItem[];

  @ApiProperty({ enum: SALE_STATUSES, example: 'completed' })
  @Index('idx_sales_status')
  @Column({ type: 'varchar', length: 15, default: 'completed' })
  status!: SaleStatus;

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt!: Date | null;

  @Column({ name: 'voided_by', type: 'integer', nullable: true })
  voidedById!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'voided_by' })
  voidedBy!: User | null;

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'void_reason', type: 'varchar', length: 255, nullable: true })
  voidReason!: string | null;

  @ApiPropertyOptional({ type: () => SaleReturn, isArray: true })
  @OneToMany(() => SaleReturn, (r) => r.sale)
  returns?: SaleReturn[];

  @ApiProperty()
  // Backs the date-range filter on the sales list.
  @Index('idx_sales_created_at')
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
