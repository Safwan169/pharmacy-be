import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProductVariant } from '../../product-variants/entities/product-variant.entity';

export interface PendingUnitPrice {
  unit_id: number;
  unit_name: string;
  price: number;
}

/**
 * A price change waiting for the older stock to sell out. At most one per
 * variant; a newer one replaces it. Activated by whatever sells or removes the
 * last of the old batches (checkout, stock count, write-off).
 */
@Entity({ name: 'variant_pending_prices' })
export class VariantPendingPrice {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: 123 })
  @Column({ name: 'variant_id', type: 'integer' })
  variantId!: number;

  @OneToOne(() => ProductVariant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant;

  @ApiProperty({
    example: 88,
    description: 'The delivery batch that brought the new price. Batches before it are "old stock".',
  })
  @Column({ name: 'after_batch_id', type: 'integer' })
  afterBatchId!: number;

  @ApiProperty({
    example: [{ unit_id: 5, unit_name: 'tablet', price: 2 }],
    description: 'The prices that will apply, per sellable unit.',
  })
  @Column({ name: 'unit_prices', type: 'jsonb' })
  unitPrices!: PendingUnitPrice[];

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'created_by_id', type: 'integer', nullable: true })
  createdById!: number | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ApiPropertyOptional({
    example: 5,
    description: 'Only on reads: sellable base units still left in the old batches.',
  })
  oldStockLeft?: number;
}
