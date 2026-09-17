import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Created by the owner through /users, or by the seed script for the first
 * owner. There is no public registration. Roles: owner, cashier.
 */
@Entity({ name: 'users' })
// Named explicitly so the entity metadata matches the migration; an unnamed
// constraint gets a generated hash name and shows up as a phantom diff.
@Unique('uq_users_email', ['email'])
@Check('chk_users_role', `"role" IN ('owner', 'cashier')`)
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'owner' })
  role!: string;

  /** A deactivated user can't log in and their existing tokens stop working. */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
