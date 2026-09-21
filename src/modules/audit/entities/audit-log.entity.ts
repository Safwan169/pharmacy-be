import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

/** One line per owner-level change worth being able to look up later. */
@Entity({ name: 'audit_log' })
@Index('idx_audit_log_entity', ['entityType', 'entityId', 'createdAt'])
export class AuditLog {
  @ApiProperty() @PrimaryGeneratedColumn() id!: number;

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'user_id', type: 'integer', nullable: true })
  userId!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @ApiProperty({ example: 'price.update' })
  @Column({ type: 'varchar', length: 40 })
  action!: string;

  @ApiProperty({ example: 'variant' })
  @Column({ name: 'entity_type', type: 'varchar', length: 30 })
  entityType!: string;

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'entity_id', type: 'integer', nullable: true })
  entityId!: number | null;

  @ApiProperty({ example: 'Napa 500 mg: strip 10.00 → 12.00' })
  @Column({ type: 'varchar', length: 255 })
  summary!: string;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  details!: Record<string, unknown> | null;

  @ApiProperty()
  @Index('idx_audit_log_created')
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
