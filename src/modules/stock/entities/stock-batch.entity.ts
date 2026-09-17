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
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { User } from '../../auth/entities/user.entity';
import { ProductVariant } from '../../product-variants/entities/product-variant.entity';

/**
 * One received lot of a SKU. Quantities are in the variant's base unit.
 * A batch with no expiry date is "uncounted" stock — carried over from before
 * batches existed, or entered without a date — and sells last.
 */
@Entity({ name: 'stock_batches' })
@Index('idx_stock_batches_variant_expiry', ['variantId', 'expiryDate'])
@Index('idx_stock_batches_in_stock', ['variantId'], { where: '"quantity" > 0' })
@Check('chk_stock_batches_quantity', `"quantity" >= 0`)
export class StockBatch {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: 123 })
  @Column({ name: 'variant_id', type: 'integer' })
  variantId!: number;

  @ManyToOne(() => ProductVariant, (variant) => variant.batches, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant;

  @ApiPropertyOptional({ example: 'B2409A', nullable: true })
  @Column({ name: 'batch_no', type: 'varchar', length: 50, nullable: true })
  batchNo!: string | null;

  @ApiPropertyOptional({
    example: '2027-03-31',
    nullable: true,
    description: 'Null for stock entered without a date. Sells last.',
  })
  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate!: string | null;

  @ApiProperty({ example: 140, description: 'Base units left in this batch.' })
  @Column({ type: 'integer', default: 0 })
  quantity!: number;

  @ApiProperty({ example: 200 })
  @Column({ name: 'initial_quantity', type: 'integer', default: 0 })
  initialQuantity!: number;

  @ApiPropertyOptional({
    example: 0.95,
    nullable: true,
    description: 'Cost per base unit. Null when nobody recorded it.',
  })
  @Column({
    name: 'cost_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  costPrice!: number | null;

  @ApiProperty()
  @Column({ name: 'received_at', type: 'timestamptz', default: () => 'now()' })
  receivedAt!: Date;

  @Column({ name: 'created_by', type: 'integer', nullable: true })
  createdById!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
