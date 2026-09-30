import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { User } from '../../auth/entities/user.entity';

/** One night's count of the cash drawer. See the DayClosing migration. */
@Entity({ name: 'day_closings' })
export class DayClosing {
  @ApiProperty()
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: '2026-09-30' })
  @Column({ name: 'business_date', type: 'date' })
  businessDate!: string;

  @ApiProperty({ description: 'What the day’s figures said the drawer should hold.' })
  @Column({ name: 'expected_cash', type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  expectedCash!: number;

  @ApiProperty({ description: 'What counting it actually found.' })
  @Column({ name: 'counted_cash', type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  countedCash!: number;

  @ApiProperty({ description: 'Counted less expected. Negative means cash left without being recorded.' })
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  difference!: number;

  @ApiProperty({ nullable: true, description: 'Where the missing cash went, in the owner’s own words.' })
  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ name: 'closed_by', type: 'integer' })
  closedById!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'closed_by' })
  closedBy?: User;

  @ApiProperty({
    description:
      'When the drawer was counted. Counting the night again moves this, ' +
      'because it is the line the next day’s opening balance is drawn from.',
  })
  @Column({ name: 'counted_at', type: 'timestamptz' })
  countedAt!: Date;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
