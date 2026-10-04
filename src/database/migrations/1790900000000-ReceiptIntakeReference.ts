import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A name the caller gives a bulk intake, so sending it twice is refused.
 *
 * An intake posts a whole stock sheet in one request. Nothing about the
 * request says whether it has been posted before, and a repeat would not fail
 * — it would quietly double every count on the sheet, which is the one
 * mistake here that is expensive and silent. A unique reference turns the
 * second attempt into a refusal naming the delivery the first one created.
 *
 * Null for every delivery entered by hand, which is why the index is partial:
 * there is no sense in which two hand-entered deliveries collide.
 */
export class ReceiptIntakeReference1790900000000 implements MigrationInterface {
  name = 'ReceiptIntakeReference1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_receipts" ADD COLUMN "intake_reference" VARCHAR(100)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_stock_receipts_intake_reference"
         ON "stock_receipts" ("intake_reference")
       WHERE "intake_reference" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_stock_receipts_intake_reference"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_receipts" DROP COLUMN "intake_reference"`,
    );
  }
}
