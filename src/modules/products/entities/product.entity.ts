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
  UpdateDateColumn,
} from 'typeorm';
import { Manufacturer } from '../../manufacturers/entities/manufacturer.entity';
import { ProductVariant } from '../../product-variants/entities/product-variant.entity';

export const PRODUCT_TYPES = ['allopathic', 'herbal'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/**
 * A brand line: one brand name from one manufacturer. Identity is
 * (brand_name, manufacturer_id) together — 70 brand names in the source are
 * reused by unrelated manufacturers, so brand name alone would merge them.
 */
@Entity({ name: 'products' })
@Unique('uq_products_brand_manufacturer', ['brandName', 'manufacturerId'])
@Check('chk_products_type', `"type" IN ('allopathic', 'herbal')`)
export class Product {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: 'A-Cold' })
  @Index('idx_products_brand_name')
  @Column({ name: 'brand_name', type: 'varchar', length: 255 })
  brandName!: string;

  @ApiProperty({ example: 12 })
  @Column({ name: 'manufacturer_id', type: 'integer' })
  manufacturerId!: number;

  @ApiProperty({ type: () => Manufacturer })
  @ManyToOne(() => Manufacturer, (manufacturer) => manufacturer.products, {
    nullable: false,
  })
  @JoinColumn({ name: 'manufacturer_id' })
  manufacturer!: Manufacturer;

  @ApiProperty({ enum: PRODUCT_TYPES, example: 'allopathic' })
  @Column({ type: 'varchar', length: 20 })
  type!: ProductType;

  @ApiProperty({ type: () => ProductVariant, isArray: true })
  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants!: ProductVariant[];

  @ApiPropertyOptional({
    example: 3,
    description:
      'Number of SKUs under this brand line. Populated on list responses.',
  })
  variantCount?: number;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
