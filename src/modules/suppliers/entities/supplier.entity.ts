import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Who the shop buys from. Referenced by stock receipts. */
@Entity({ name: 'suppliers' })
@Unique('uq_suppliers_name', ['name'])
export class Supplier {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: 'Square Distribution' })
  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @ApiPropertyOptional({ example: '01711000000', nullable: true })
  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  address!: string | null;

  @ApiProperty({ example: true })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
