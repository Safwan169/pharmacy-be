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
import { ProductVariant } from '../../product-variants/entities/product-variant.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { StockBatch } from './stock-batch.entity';

/** A goods-received note: one delivery from a supplier, any number of lines. */
@Entity({ name: 'stock_receipts' })
@Unique('uq_stock_receipts_number', ['receiptNumber'])
export class StockReceipt {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: 'GRN-20260917-0003' })
  @Column({ name: 'receipt_number', type: 'varchar', length: 30 })
  receiptNumber!: string;

  @ApiPropertyOptional({ example: 2, nullable: true })
  @Index('idx_stock_receipts_supplier')
  @Column({ name: 'supplier_id', type: 'integer', nullable: true })
  supplierId!: number | null;

  @ApiPropertyOptional({ type: () => Supplier, nullable: true })
  @ManyToOne(() => Supplier, { nullable: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier!: Supplier | null;

  @ApiPropertyOptional({ example: 'SQ-88213', nullable: true })
  @Column({
    name: 'supplier_invoice_no',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  supplierInvoiceNo!: string | null;

  @ApiProperty({ example: '2026-09-17' })
  @Index('idx_stock_receipts_received_at')
  @Column({ name: 'received_at', type: 'date', default: () => 'CURRENT_DATE' })
  receivedAt!: string;

  @ApiProperty({ example: 12500 })
  @Column({
    name: 'total_cost',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  totalCost!: number;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  note!: string | null;

  @Column({ name: 'created_by', type: 'integer' })
  createdById!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User;

  @ApiProperty({ type: () => StockReceiptItem, isArray: true })
  @OneToMany(() => StockReceiptItem, (item) => item.receipt)
  items!: StockReceiptItem[];

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

/** One line of a receipt. The batch it created carries the running quantity. */
@Entity({ name: 'stock_receipt_items' })
@Check('chk_stock_receipt_items_quantity', `"quantity" > 0`)
export class StockReceiptItem {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('idx_stock_receipt_items_receipt')
  @Column({ name: 'receipt_id', type: 'integer' })
  receiptId!: number;

  @ManyToOne(() => StockReceipt, (receipt) => receipt.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'receipt_id' })
  receipt!: StockReceipt;

  @ApiProperty({ example: 123 })
  @Index('idx_stock_receipt_items_variant')
  @Column({ name: 'variant_id', type: 'integer' })
  variantId!: number;

  @ApiPropertyOptional({ type: () => ProductVariant })
  @ManyToOne(() => ProductVariant, { nullable: false })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant;

  @ApiProperty({ example: 7 })
  @Column({ name: 'batch_id', type: 'integer' })
  batchId!: number;

  @ManyToOne(() => StockBatch, { nullable: false })
  @JoinColumn({ name: 'batch_id' })
  batch!: StockBatch;

  @ApiPropertyOptional({ example: 'B2409A', nullable: true })
  @Column({ name: 'batch_no', type: 'varchar', length: 50, nullable: true })
  batchNo!: string | null;

  @ApiPropertyOptional({ example: '2027-03-31', nullable: true })
  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate!: string | null;

  @ApiProperty({ example: 'box', description: 'The unit it was bought in.' })
  @Column({ name: 'unit_name', type: 'varchar', length: 30 })
  unitName!: string;

  @ApiProperty({ example: 100 })
  @Column({ name: 'qty_in_base', type: 'integer' })
  qtyInBase!: number;

  @ApiProperty({ example: 5, description: 'In the purchase unit.' })
  @Column({ type: 'integer' })
  quantity!: number;

  @ApiProperty({ example: 500, description: 'quantity * qty_in_base.' })
  @Column({ name: 'base_quantity', type: 'integer' })
  baseQuantity!: number;

  @ApiProperty({ example: 950, description: 'Cost per purchase unit.' })
  @Column({
    name: 'unit_cost',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  unitCost!: number;

  @ApiProperty({ example: 4750 })
  @Column({
    name: 'line_cost',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  lineCost!: number;
}
