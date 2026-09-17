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
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { User } from '../../auth/entities/user.entity';

/** Someone who buys on credit. Only "due" sales need a customer. */
@Entity({ name: 'customers' })
@Unique('uq_customers_phone', ['phone'])
@Index('idx_customers_name', ['name'])
export class Customer {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: 'Karim Uddin' })
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @ApiPropertyOptional({ example: '01711000000', nullable: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  address!: string | null;

  @ApiProperty({ example: 450, description: 'What they still owe.' })
  @Column({
    name: 'due_balance',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  dueBalance!: number;

  @ApiProperty({ example: true })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

export const DUE_PAYMENT_METHODS = ['cash', 'bkash'] as const;
export type DuePaymentMethod = (typeof DUE_PAYMENT_METHODS)[number];

/** Money received against a customer's due balance. */
@Entity({ name: 'due_payments' })
@Unique('uq_due_payments_number', ['receiptNumber'])
@Check('chk_due_payments_method', `"method" IN ('cash', 'bkash')`)
@Check('chk_due_payments_amount', `"amount" > 0`)
@Index('idx_due_payments_customer', ['customerId', 'createdAt'])
export class DuePayment {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: 1 })
  @Column({ name: 'customer_id', type: 'integer' })
  customerId!: number;

  @ManyToOne(() => Customer, { nullable: false })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @ApiPropertyOptional({ example: 42, nullable: true, description: 'When paying off one specific sale.' })
  @Column({ name: 'sale_id', type: 'integer', nullable: true })
  saleId!: number | null;

  @ApiProperty({ example: 'PAY-20260917-0002' })
  @Column({ name: 'receipt_number', type: 'varchar', length: 30 })
  receiptNumber!: string;

  @ApiProperty({ example: 200 })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  amount!: number;

  @ApiProperty({ enum: DUE_PAYMENT_METHODS, example: 'cash' })
  @Column({ type: 'varchar', length: 10 })
  method!: DuePaymentMethod;

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'bkash_trx_id', type: 'varchar', length: 30, nullable: true })
  bkashTrxId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  note!: string | null;

  @ApiProperty({ example: 250, description: 'Due balance right after this payment.' })
  @Column({
    name: 'balance_after',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  balanceAfter!: number;

  @Column({ name: 'created_by', type: 'integer' })
  createdById!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User;

  @ApiProperty()
  @Index('idx_due_payments_created')
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
