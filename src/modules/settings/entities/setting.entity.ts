import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Key/value shop configuration the owner edits from the app. */
@Entity({ name: 'settings' })
export class Setting {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  key!: string;

  @Column({ type: 'text', default: '' })
  value!: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
