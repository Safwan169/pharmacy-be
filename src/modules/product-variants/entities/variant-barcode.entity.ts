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
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { ProductVariant } from './product-variant.entity';
import { VariantUnit } from './variant-unit.entity';

/**
 * A code printed on a pack, tied to the medicine inside it. Learned at the
 * counter or the delivery table rather than imported: the public medicine
 * list the catalogue came from has no barcodes at all.
 */
@Entity({ name: 'variant_barcodes' })
@Unique('uq_variant_barcodes_code', ['code'])
export class VariantBarcode {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('idx_variant_barcodes_variant')
  @ApiProperty({ example: 42 })
  @Column({ name: 'variant_id', type: 'integer' })
  variantId!: number;

  @ManyToOne(() => ProductVariant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant;

  @ApiProperty({
    example: '8941100010015',
    description: 'Exactly what the scanner read, trimmed and upper-cased.',
  })
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 7,
    description:
      'The unit this code is printed on — a box barcode should ring up a box, ' +
      'not the tablet inside it. Null when it was paired without knowing.',
  })
  @Column({ name: 'unit_id', type: 'integer', nullable: true })
  unitId!: number | null;

  @ManyToOne(() => VariantUnit, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'unit_id' })
  unit!: VariantUnit | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'strip',
    description: 'Which pack carries it, when one medicine has several codes.',
  })
  @Column({ type: 'varchar', length: 120, nullable: true })
  note!: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'created_by', type: 'integer', nullable: true })
  createdById!: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
