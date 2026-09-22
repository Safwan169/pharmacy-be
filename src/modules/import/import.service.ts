import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Generic } from '../generics/entities/generic.entity';
import { Manufacturer } from '../manufacturers/entities/manufacturer.entity';
import { baseUnitForDosageForm } from '../product-variants/base-unit';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import { Product } from '../products/entities/product.entity';
import { ImportResultDto } from './dto/import-result.dto';
import { parseMedicineCsv, productKey } from './medicine-csv.parser';
import type { ParsedVariant } from './medicine-csv.parser';

/** Rows per INSERT. Keeps the statement well under Postgres' 65535 parameter cap. */
const CHUNK_SIZE = 1000;
const MAX_REPORTED_SKIPS = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Loads the medicine catalogue. Idempotent: variants are matched on
   * `legacy_brand_id`, and an existing row has its descriptive fields refreshed
   * while `price`, `stock_quantity` and `price_updated_at` are left untouched —
   * a re-import must never wipe out pricing the admin has already entered.
   *
   * Runs in a single transaction, so a failure part-way leaves no partial catalogue.
   */
  async importFromCsv(content: Buffer | string): Promise<ImportResultDto> {
    const startedAt = Date.now();
    const catalog = parseMedicineCsv(content);
    this.logger.log(
      `Parsed ${catalog.variants.length} variants ` +
        `(${catalog.products.length} products, ${catalog.manufacturerNames.length} manufacturers, ` +
        `${catalog.genericNames.length} generics, ${catalog.skipped.length} skipped).`,
    );

    return this.dataSource.transaction(async (manager) => {
      const variantsBefore = await manager.count(ProductVariant);
      const legacyIds = await this.assignLegacyIds(manager, catalog.variants);

      const manufacturerIds = await this.upsertManufacturers(
        manager,
        catalog.manufacturerNames,
      );
      const genericIds = await this.upsertGenerics(
        manager,
        catalog.genericNames,
      );
      const productIds = await this.upsertProducts(
        manager,
        catalog.products,
        manufacturerIds,
      );

      const variantRows = catalog.variants.map((variant) => {
        const key = productKey(variant.brandName, variant.manufacturerName);
        const productId = productIds.get(key);
        // Can only happen through a bug in the grouping above. Fail with
        // something readable instead of a not-null violation on product_id.
        if (productId === undefined) {
          throw new Error(
            `No parent product resolved for "${key}" ` +
              `(legacy brand id ${variant.legacyBrandId})`,
          );
        }
        return {
          productId,
          genericId:
            variant.genericName === null
              ? null
              : (genericIds.get(variant.genericName) ?? null),
          dosageForm: variant.dosageForm,
          strength: variant.strength,
          slug: variant.slug,
          legacyBrandId: variant.legacyBrandId ?? legacyIds.get(variant)!,
          packSize: variant.packSize,
          mrp: variant.unitMrp,
          packMrp: variant.packMrp,
          // Only used on insert: base_unit is left out of the update list so a
          // re-import never overrides what the admin chose.
          baseUnit: baseUnitForDosageForm(variant.dosageForm),
        };
      });

      for (const batch of chunk(variantRows, CHUNK_SIZE)) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(ProductVariant)
          .values(batch)
          // Explicit overwrite list — `price`, `stock_quantity` and
          // `price_updated_at` are deliberately absent so admin pricing survives.
          .orUpdate(
            [
              'product_id',
              'generic_id',
              'dosage_form',
              'strength',
              'slug',
              'pack_size',
              'mrp',
              'pack_mrp',
            ],
            ['legacy_brand_id'],
          )
          .execute();
      }

      const [variantsTotal, productsTotal, manufacturersTotal, genericsTotal] =
        await Promise.all([
          manager.count(ProductVariant),
          manager.count(Product),
          manager.count(Manufacturer),
          manager.count(Generic),
        ]);

      const variantsCreated = variantsTotal - variantsBefore;
      const result: ImportResultDto = {
        rowsParsed: catalog.variants.length,
        rowsSkipped: catalog.skipped.length,
        variantsCreated,
        variantsUpdated: catalog.variants.length - variantsCreated,
        productsTotal,
        manufacturersTotal,
        genericsTotal,
        variantsTotal,
        durationMs: Date.now() - startedAt,
        skipped: catalog.skipped.slice(0, MAX_REPORTED_SKIPS),
      };

      this.logger.log(
        `Import finished in ${result.durationMs}ms: ` +
          `${result.variantsCreated} created, ${result.variantsUpdated} updated.`,
      );
      return result;
    });
  }

  /**
   * Rows from a shop's own file carry no `brand id`. One is worked out here so
   * re-importing the same file updates those medicines instead of duplicating
   * them: an id already used by the same brand + company + strength + form is
   * reused, and anything genuinely new is numbered above everything in use.
   */
  private async assignLegacyIds(
    manager: EntityManager,
    variants: ParsedVariant[],
  ): Promise<Map<ParsedVariant, number>> {
    const assigned = new Map<ParsedVariant, number>();
    const needing = variants.filter((v) => v.legacyBrandId === null);
    if (needing.length === 0) return assigned;

    const existing = await manager
      .createQueryBuilder(ProductVariant, 'variant')
      .select(['variant.legacyBrandId', 'variant.strength', 'variant.dosageForm'])
      .addSelect(['product.brandName', 'manufacturer.name'])
      .innerJoin('variant.product', 'product')
      .innerJoin('product.manufacturer', 'manufacturer')
      .where('variant.legacyBrandId IS NOT NULL')
      .getRawMany<{
        variant_legacy_brand_id: number;
        variant_strength: string | null;
        variant_dosage_form: string;
        product_brand_name: string;
        manufacturer_name: string;
      }>();
    const key = (brand: string, maker: string, strength: string | null, form: string) =>
      [brand, maker, strength ?? '', form].map((p) => p.trim().toLowerCase()).join('|');
    const byKey = new Map(
      existing.map((r) => [
        key(r.product_brand_name, r.manufacturer_name, r.variant_strength, r.variant_dosage_form),
        r.variant_legacy_brand_id,
      ]),
    );

    const max = await manager
      .createQueryBuilder(ProductVariant, 'variant')
      .select('COALESCE(MAX(variant.legacyBrandId), 0)', 'max')
      .getRawOne<{ max: string }>();
    let next = Number(max?.max ?? 0) + 1;
    const used = new Set(variants.map((v) => v.legacyBrandId).filter((id): id is number => id !== null));

    for (const variant of needing) {
      const match = byKey.get(
        key(variant.brandName, variant.manufacturerName, variant.strength, variant.dosageForm),
      );
      if (match !== undefined && !used.has(match)) {
        assigned.set(variant, match);
        used.add(match);
        continue;
      }
      while (used.has(next)) next += 1;
      assigned.set(variant, next);
      used.add(next);
    }
    return assigned;
  }

  private async upsertManufacturers(
    manager: EntityManager,
    names: string[],
  ): Promise<Map<string, number>> {
    for (const batch of chunk(names, CHUNK_SIZE)) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(Manufacturer)
        .values(batch.map((name) => ({ name })))
        .orIgnore()
        .execute();
    }
    const rows = await manager.find(Manufacturer, {
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.name, row.id]));
  }

  private async upsertGenerics(
    manager: EntityManager,
    names: string[],
  ): Promise<Map<string, number>> {
    for (const batch of chunk(names, CHUNK_SIZE)) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(Generic)
        .values(batch.map((name) => ({ name })))
        .orIgnore()
        .execute();
    }
    const rows = await manager.find(Generic, {
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.name, row.id]));
  }

  /** Returns a map keyed by `productKey(brandName, manufacturerName)`. */
  private async upsertProducts(
    manager: EntityManager,
    products: { brandName: string; manufacturerName: string; type: string }[],
    manufacturerIds: Map<string, number>,
  ): Promise<Map<string, number>> {
    const rows = products.map((product) => ({
      brandName: product.brandName,
      manufacturerId: manufacturerIds.get(product.manufacturerName)!,
      type: product.type as Product['type'],
    }));

    for (const batch of chunk(rows, CHUNK_SIZE)) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(Product)
        .values(batch)
        .orUpdate(['type'], ['brand_name', 'manufacturer_id'])
        .execute();
    }

    const saved = await manager.find(Product, {
      select: { id: true, brandName: true, manufacturerId: true },
    });
    const idToManufacturerName = new Map(
      [...manufacturerIds].map(([name, id]) => [id, name]),
    );

    const map = new Map<string, number>();
    for (const row of saved) {
      const manufacturerName = idToManufacturerName.get(row.manufacturerId);
      if (manufacturerName !== undefined) {
        map.set(productKey(row.brandName, manufacturerName), row.id);
      }
    }
    return map;
  }
}
