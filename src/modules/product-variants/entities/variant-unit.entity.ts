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
import { ProductVariant } from './product-variant.entity';

/**
 * One way a SKU can be sold — "strip of 10 at ৳12", "box of 100 at ৳110".
 * `qty_in_base` is how many base units (tablets, bottles…) it contains, which
 * is what checkout deducts from `stock_quantity`.
 */
@Entity({ name: 'variant_units' })
@Unique('uq_variant_units_variant_name', ['variantId', 'name'])
@Check('chk_variant_units_qty', `"qty_in_base" > 0`)
export class VariantUnit {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: 123 })
  @Index('idx_variant_units_variant')
  @Column({ name: 'variant_id', type: 'integer' })
  variantId!: number;

  @ManyToOne(() => ProductVariant, (variant) => variant.units, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant;

  @ApiProperty({ example: 'strip' })
  @Column({ type: 'varchar', length: 30 })
  name!: string;

  @ApiProperty({ example: 10, description: 'Base units in one of these.' })
  @Column({ name: 'qty_in_base', type: 'integer' })
  qtyInBase!: number;

  @ApiPropertyOptional({ example: 12, nullable: true })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  price!: number | null;

  @ApiProperty({
    example: true,
    description: 'False for a unit the shop will not break down to.',
  })
  @Column({ name: 'is_sellable', type: 'boolean', default: true })
  isSellable!: boolean;

  @ApiProperty({
    example: true,
    description: 'The unit the counter pre-selects. Exactly one per variant.',
  })
  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @ApiProperty({ example: 1 })
  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
