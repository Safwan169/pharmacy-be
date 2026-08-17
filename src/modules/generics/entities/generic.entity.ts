import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ProductVariant } from '../../product-variants/entities/product-variant.entity';

/** Active ingredient. Held at the variant level because ~5% of multi-variant
 * brands differ in generic between their variants (e.g. oral vs lotion). */
@Entity({ name: 'generics' })
@Unique('uq_generics_name', ['name'])
export class Generic {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: 'Bromhexine Hydrochloride' })
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @OneToMany(() => ProductVariant, (variant) => variant.generic)
  variants!: ProductVariant[];

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
