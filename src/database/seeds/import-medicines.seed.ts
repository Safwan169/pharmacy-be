import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../../app.module';
import { ImportService } from '../../modules/import/import.service';
import { DataSource } from 'typeorm';

const DEFAULT_CSV = path.join(process.cwd(), 'src', 'docs', 'medicine.csv');

/**
 * Loads the medicine catalogue from disk. Preferred over the HTTP upload for the
 * initial ~21.7k-row load, which takes long enough to risk an HTTP timeout.
 *
 * Usage: `npm run import:csv [-- path/to/medicine.csv] [--if-empty]`
 *
 * `--if-empty` makes it a no-op once the catalogue has rows, so it can sit in
 * a deploy hook without re-importing 21k lines on every release.
 */
async function importMedicines(): Promise<void> {
  const logger = new Logger('MedicineImport');
  const args = process.argv.slice(2);
  const ifEmpty = args.includes('--if-empty');
  const csvPath = args.find((a) => !a.startsWith('--')) ?? DEFAULT_CSV;

  if (!fs.existsSync(csvPath)) {
    logger.error(`CSV not found at ${csvPath}`);
    process.exitCode = 1;
    return;
  }

  const appContext = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    if (ifEmpty) {
      const [{ count }] = (await appContext
        .get(DataSource)
        .query('SELECT COUNT(*)::int AS count FROM product_variants')) as [{ count: number }];
      if (count > 0) {
        logger.log(`Catalogue already holds ${count} variants — skipping import.`);
        return;
      }
    }
    logger.log(`Importing from ${csvPath}`);
    const result = await appContext
      .get(ImportService)
      .importFromCsv(fs.readFileSync(csvPath));

    logger.log(
      `Done in ${result.durationMs}ms — ` +
        `${result.variantsCreated} variants created, ${result.variantsUpdated} updated, ` +
        `${result.rowsSkipped} rows skipped.`,
    );
    logger.log(
      `Catalogue now holds ${result.manufacturersTotal} manufacturers, ` +
        `${result.genericsTotal} generics, ${result.productsTotal} products, ` +
        `${result.variantsTotal} variants.`,
    );
    for (const skip of result.skipped) {
      logger.warn(`line ${skip.line}: ${skip.reason}`);
    }
  } finally {
    await appContext.close();
  }
}

importMedicines().catch((error: unknown) => {
  new Logger('MedicineImport').error(error);
  process.exitCode = 1;
});
