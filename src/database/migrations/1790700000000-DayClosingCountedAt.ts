import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * When the drawer was counted, as opposed to which day it was counted for.
 *
 * Tomorrow's opening balance was the count plus everything that moved from
 * midnight onwards, which quietly dropped whatever happened between the count
 * and midnight. Pay a supplier out of the drawer at ten past eleven, after
 * counting at eleven, and that money left the shop without ever leaving the
 * books.
 *
 * Taking the moment of the count as the line instead closes the gap. It is a
 * column of its own rather than `created_at` because counting a night again —
 * which the shop is allowed to do — has to move the line with it, and the row
 * was created once.
 */
export class DayClosingCountedAt1790700000000 implements MigrationInterface {
  name = 'DayClosingCountedAt1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "day_closings" ADD COLUMN "counted_at" TIMESTAMPTZ`,
    );
    // Rows written before this existed were counted once, when they were made.
    await queryRunner.query(
      `UPDATE "day_closings" SET "counted_at" = "created_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "day_closings" ALTER COLUMN "counted_at" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "day_closings" ALTER COLUMN "counted_at" SET DEFAULT now()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "day_closings" DROP COLUMN "counted_at"`,
    );
  }
}
