import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Only ever populated by the admin seed script — the API exposes no registration
 * endpoint. `role` is stored now (single value today) so adding more roles later
 * is a data change rather than a breaking migration.
 */
@Entity({ name: 'users' })
// Named explicitly so the entity metadata matches the migration; an unnamed
// constraint gets a generated hash name and shows up as a phantom diff.
@Unique('uq_users_email', ['email'])
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 20, default: 'admin' })
  role!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
