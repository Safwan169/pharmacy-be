import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { ProductVariant } from '../../product-variants/entities/product-variant.entity';
import { Sale } from './sale.entity';

/**
 * A sold line. The `*_snapshot` columns and `unit_price` are copied at checkout
 * time on purpose: a later catalogue edit (rename, re-price, or delete) must not
 * change what a historical invoice says was sold. `product_variant_id` stays as
 * a normal FK for reporting, but the invoice renders from the snapshots.
 */
@Entity({ name: 'sale_items' })
@Check('chk_sale_items_quantity', `"quantity" > 0`)
export class SaleItem {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('idx_sale_items_sale')
  @Column({ name: 'sale_id', type: 'integer' })
  saleId!: number;

  @ManyToOne(() => Sale, (sale) => sale.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sale_id' })
  sale!: Sale;

  @ApiProperty({ example: 123 })
  @Index('idx_sale_items_variant')
  @Column({ name: 'product_variant_id', type: 'integer' })
  productVariantId!: number;

  @ApiPropertyOptional({ type: () => ProductVariant })
  @ManyToOne(() => ProductVariant, { nullable: false })
  @JoinColumn({ name: 'product_variant_id' })
  productVariant!: ProductVariant;

  @ApiProperty({ example: 'Napa' })
  @Column({ name: 'brand_name_snapshot', type: 'varchar', length: 255 })
  brandNameSnapshot!: string;

  @ApiProperty({ example: 'Tablet' })
  @Column({ name: 'dosage_form_snapshot', type: 'varchar', length: 100 })
  dosageFormSnapshot!: string;

  @ApiPropertyOptional({ example: '500 mg', nullable: true })
  @Column({
    name: 'strength_snapshot',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  strengthSnapshot!: string | null;

  @ApiProperty({ example: 'strip', description: 'Unit it was sold in.' })
  @Column({
    name: 'unit_name_snapshot',
    type: 'varchar',
    length: 30,
    default: 'piece',
  })
  unitNameSnapshot!: string;

  @ApiProperty({ example: 10, description: 'Base units in one sold unit.' })
  @Column({ name: 'qty_in_base', type: 'integer', default: 1 })
  qtyInBase!: number;

  @ApiProperty({
    example: 20,
    description: 'quantity * qty_in_base — what left the stock count.',
  })
  @Column({ name: 'base_qty_deducted', type: 'integer', default: 0 })
  baseQtyDeducted!: number;

  @ApiProperty({
    example: 50,
    description: 'Price of the sold unit at the moment of checkout.',
  })
  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  unitPrice!: number;

  @ApiProperty({ example: 2, description: 'In the sold unit.' })
  @Column({ type: 'integer' })
  quantity!: number;

  @ApiProperty({ example: 100, description: 'unit_price * quantity.' })
  @Column({
    name: 'line_total',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  lineTotal!: number;
}
