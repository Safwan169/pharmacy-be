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
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { ProductVariant } from '../../product-variants/entities/product-variant.entity';
import { StockBatch } from './stock-batch.entity';

export const MOVEMENT_TYPES = [
  'sale',
  'sale_return',
  'stock_in',
  'adjustment',
  'expired_writeoff',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/**
 * The ledger. One row per change to a variant's stock, signed in base units,
 * with the running total before and after. Nothing ever changes stock without
 * writing one of these.
 */
@Entity({ name: 'stock_movements' })
@Index('idx_stock_movements_variant_created', ['variantId', 'createdAt'])
@Check(
  'chk_stock_movements_type',
  `"type" IN ('sale', 'sale_return', 'stock_in', 'adjustment', 'expired_writeoff')`,
)
export class StockMovement {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: 123 })
  @Column({ name: 'variant_id', type: 'integer' })
  variantId!: number;

  @ManyToOne(() => ProductVariant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant;

  @ApiPropertyOptional({ example: 7, nullable: true })
  @Column({ name: 'batch_id', type: 'integer', nullable: true })
  batchId!: number | null;

  @ManyToOne(() => StockBatch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'batch_id' })
  batch!: StockBatch | null;

  @ApiProperty({ enum: MOVEMENT_TYPES, example: 'sale' })
  @Column({ type: 'varchar', length: 20 })
  type!: MovementType;

  @ApiProperty({
    example: -20,
    description: 'Signed change in base units. Negative leaves the shelf.',
  })
  @Column({ type: 'integer' })
  quantity!: number;

  @ApiProperty({ example: 340 })
  @Column({ name: 'previous_stock', type: 'integer' })
  previousStock!: number;

  @ApiProperty({ example: 320 })
  @Column({ name: 'new_stock', type: 'integer' })
  newStock!: number;

  @ApiPropertyOptional({ example: 'sale', nullable: true })
  @Column({ name: 'reference_type', type: 'varchar', length: 20, nullable: true })
  referenceType!: string | null;

  @ApiPropertyOptional({ example: 42, nullable: true })
  @Column({ name: 'reference_id', type: 'integer', nullable: true })
  referenceId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  note!: string | null;

  @Column({ name: 'created_by', type: 'integer', nullable: true })
  createdById!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @ApiProperty()
  @Index('idx_stock_movements_created')
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
