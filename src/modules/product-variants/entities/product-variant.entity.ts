import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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
import { Generic } from '../../generics/entities/generic.entity';
import { Product } from '../../products/entities/product.entity';

/**
 * The sellable SKU — one row per source CSV row. Price and stock live here and
 * start NULL; the admin fills them in later through the pricing endpoint.
 */
@Entity({ name: 'product_variants' })
@Unique('uq_variants_slug', ['slug'])
@Unique('uq_variants_legacy_brand_id', ['legacyBrandId'])
// Partial index backing the admin's "needs pricing" worklist. Declared here as
// well as in the migration so `migration:generate` doesn't try to drop it.
@Index('idx_variants_price_null', ['id'], { where: '"price" IS NULL' })
export class ProductVariant {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: 1 })
  @Index('idx_variants_product')
  @Column({ name: 'product_id', type: 'integer' })
  productId!: number;

  @ApiProperty({ type: () => Product })
  @ManyToOne(() => Product, (product) => product.variants, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @ApiPropertyOptional({ example: 5, nullable: true })
  @Index('idx_variants_generic')
  @Column({ name: 'generic_id', type: 'integer', nullable: true })
  genericId!: number | null;

  @ApiPropertyOptional({ type: () => Generic, nullable: true })
  @ManyToOne(() => Generic, (generic) => generic.variants, { nullable: true })
  @JoinColumn({ name: 'generic_id' })
  generic!: Generic | null;

  @ApiProperty({ example: 'Syrup' })
  @Column({ name: 'dosage_form', type: 'varchar', length: 100 })
  dosageForm!: string;

  @ApiPropertyOptional({
    example: '4 mg/5 ml',
    nullable: true,
    description:
      'Null for products without a fixed dose (mostly herbal syrups).',
  })
  @Column({ type: 'varchar', length: 100, nullable: true })
  strength!: string | null;

  @ApiPropertyOptional({ example: 'a-coldsyrup4-mg5-ml', nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  slug!: string | null;

  @ApiPropertyOptional({
    example: 4077,
    nullable: true,
    description: 'Original CSV `brand id`. The idempotency key for re-imports.',
  })
  @Column({ name: 'legacy_brand_id', type: 'integer', nullable: true })
  legacyBrandId!: number | null;

  @ApiPropertyOptional({
    example: 40.12,
    nullable: true,
    description: 'Null until an admin sets it.',
  })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  price!: number | null;

  @ApiPropertyOptional({
    example: 250,
    nullable: true,
    description:
      'Null means "not yet set by an admin"; 0 means confirmed out of stock.',
  })
  @Column({ name: 'stock_quantity', type: 'integer', nullable: true })
  stockQuantity!: number | null;

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'price_updated_at', type: 'timestamptz', nullable: true })
  priceUpdatedAt!: Date | null;

  @ApiProperty({
    example: true,
    description:
      'False means the SKU was withdrawn from the catalogue. It is hidden from ' +
      'listings and cannot be sold, but its past sale lines are untouched.',
  })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
