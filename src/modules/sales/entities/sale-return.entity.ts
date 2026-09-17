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
import { Sale } from './sale.entity';

export const REFUND_METHODS = ['cash', 'bkash', 'due_adjust'] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

/** Items taken back after a sale, with the money given back. */
@Entity({ name: 'sale_returns' })
@Unique('uq_sale_returns_number', ['returnNumber'])
@Check('chk_sale_returns_method', `"refund_method" IN ('cash', 'bkash', 'due_adjust')`)
export class SaleReturn {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: 42 })
  @Index('idx_sale_returns_sale')
  @Column({ name: 'sale_id', type: 'integer' })
  saleId!: number;

  @ManyToOne(() => Sale, (sale) => sale.returns, { nullable: false })
  @JoinColumn({ name: 'sale_id' })
  sale!: Sale;

  @ApiProperty({ example: 'RET-20260917-0001' })
  @Column({ name: 'return_number', type: 'varchar', length: 30 })
  returnNumber!: string;

  @ApiProperty({ example: 108 })
  @Column({
    name: 'refund_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  refundAmount!: number;

  @ApiProperty({ enum: REFUND_METHODS, example: 'cash' })
  @Column({ name: 'refund_method', type: 'varchar', length: 10 })
  refundMethod!: RefundMethod;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  reason!: string | null;

  @Column({ name: 'created_by', type: 'integer' })
  createdById!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User;

  @ApiProperty({ type: () => SaleReturnItem, isArray: true })
  @OneToMany(() => SaleReturnItem, (item) => item.saleReturn)
  items!: SaleReturnItem[];

  @ApiProperty()
  @Index('idx_sale_returns_created')
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

@Entity({ name: 'sale_return_items' })
@Check('chk_sale_return_items_quantity', `"quantity" > 0`)
export class SaleReturnItem {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('idx_sale_return_items_return')
  @Column({ name: 'return_id', type: 'integer' })
  returnId!: number;

  @ManyToOne(() => SaleReturn, (r) => r.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'return_id' })
  saleReturn!: SaleReturn;

  @ApiProperty({ example: 7 })
  @Column({ name: 'sale_item_id', type: 'integer' })
  saleItemId!: number;

  @ManyToOne(() => SaleItem, { nullable: false })
  @JoinColumn({ name: 'sale_item_id' })
  saleItem!: SaleItem;

  @ApiProperty({ example: 1, description: 'In the unit it was sold in.' })
  @Column({ type: 'integer' })
  quantity!: number;

  @ApiProperty({ example: 10 })
  @Column({ name: 'base_quantity', type: 'integer' })
  baseQuantity!: number;

  @ApiProperty({ example: 10.8 })
  @Column({
    name: 'refund_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  refundAmount!: number;

  @ApiProperty({
    example: true,
    description: 'False when the goods were damaged and went in the bin.',
  })
  @Column({ type: 'boolean', default: true })
  restock!: boolean;
}
