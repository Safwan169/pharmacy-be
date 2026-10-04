import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import { ProductVariantsService } from '../product-variants/product-variants.service';
import { ReceiptsService } from '../stock/receipts.service';
import { StockReceipt } from '../stock/entities/stock-receipt.entity';
import { ReceiptLineDto } from '../stock/dto/receipt.dto';
import {
  StockIntakeDto,
  StockIntakeItemDto,
  StockIntakeLineDto,
  StockIntakeResultDto,
} from './dto/stock-intake.dto';

/** One medicine on the sheet, after repeats have been added together. */
interface Folded {
  product: string;
  brand: string;
  /** The number after the dash, when the name carries one. */
  strength: string | null;
  pieces: number;
  price: number;
  cost: number | null;
}

/** "88 P", "88", "88 pcs" — the first run of digits is the count. */
function countOf(raw: string): number {
  const found = /\d+/.exec(raw ?? '');
  return found ? Number(found[0]) : 0;
}

/** "Ramil - 2.5" -> Ramil + 2.5;  "Metrinon" -> Metrinon + nothing. */
function splitName(raw: string): { brand: string; strength: string | null } {
  const trimmed = raw.trim();
  for (const pattern of [/^(.*?)\s*-\s*([\d.]+)$/, /^(.*?)\s+([\d.]+)$/]) {
    const found = pattern.exec(trimmed);
    if (found) return { brand: found[1].trim(), strength: found[2] };
  }
  return { brand: trimmed, strength: null };
}

function firstNumber(text: string | null | undefined): string | null {
  const found = /[\d.]+/.exec(text ?? '');
  return found ? found[0] : null;
}

function amount(
  raw: string | undefined,
  field: string,
  product: string,
): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestException({
      message: `"${product}": ${field} must be a number, got "${raw}".`,
      reason: 'intake_bad_number',
    });
  }
  return Math.round(value * 100) / 100;
}

/**
 * A whole stock sheet in one request.
 *
 * The shop's own list names medicines the way the shop says them — "Ramil -
 * 2.5", a count, a rate — and nothing else. Turning that into stock meant
 * three different calls per line and a person to join them up. This does the
 * joining: read the name, find the medicine, add up anything listed twice,
 * create what the catalogue has never heard of, and put the lot in as one
 * delivery.
 *
 * Two things it deliberately will not do. It never guesses between two
 * medicines that both fit a name — that line is reported and left out. And it
 * refuses a reference it has already seen, because the expensive mistake here
 * is silent: a sheet sent twice would double every count on it and look
 * exactly like success.
 */
@Injectable()
export class StockIntakeService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly variantsService: ProductVariantsService,
    private readonly receiptsService: ReceiptsService,
  ) {}

  async intake(
    dto: StockIntakeDto,
    userId: number,
  ): Promise<StockIntakeResultDto> {
    const dryRun = dto.dry_run === true;
    const reference = dto.reference?.trim() || null;

    if (reference !== null) {
      const already = await this.dataSource
        .getRepository(StockReceipt)
        .findOne({
          where: { intakeReference: reference },
        });
      if (already) {
        throw new ConflictException({
          message:
            `Reference "${reference}" was already taken in as ` +
            `${already.receiptNumber}. Nothing was changed.`,
          reason: 'intake_already_done',
          receipt_number: already.receiptNumber,
        });
      }
    }

    const folded = this.fold(dto.items);
    const lines: StockIntakeLineDto[] = [];
    const receiptLines: ReceiptLineDto[] = [];

    for (const item of folded) {
      const candidates = await this.candidatesFor(item);

      if (candidates.length > 1) {
        lines.push({
          product: item.product,
          status: 'ambiguous',
          pieces: item.pieces,
          price: item.price,
          cost: item.cost,
          variant_id: null,
          options: candidates.map((v) => this.label(v)),
        });
        continue;
      }

      let variant = candidates[0];
      let status: StockIntakeLineDto['status'] = 'matched';

      if (variant === undefined) {
        status = 'created';
        if (!dryRun) {
          const manufacturer = dto.default_manufacturer?.trim();
          if (!manufacturer) {
            throw new BadRequestException({
              message:
                `"${item.product}" is not in the catalogue. Send ` +
                'default_manufacturer to say which company new medicines belong to.',
              reason: 'intake_manufacturer_required',
            });
          }
          try {
            variant = await this.variantsService.create({
              brand_name: item.brand,
              manufacturer_name: manufacturer,
              dosage_form: dto.default_dosage_form?.trim() || 'Tablet',
              ...(item.strength === null
                ? {}
                : { strength: `${item.strength} mg` }),
            });
          } catch (error) {
            lines.push({
              product: item.product,
              status: 'failed',
              pieces: item.pieces,
              price: item.price,
              cost: item.cost,
              variant_id: null,
              message:
                error instanceof Error
                  ? error.message
                  : 'Could not be created.',
            });
            continue;
          }
        }
      }

      lines.push({
        product: item.product,
        status,
        pieces: item.pieces,
        price: item.price,
        cost: item.cost,
        variant_id: variant?.id ?? null,
        ...(variant === undefined ? {} : { matched_as: this.label(variant) }),
      });

      if (!dryRun && variant !== undefined) {
        receiptLines.push({
          variant_id: variant.id,
          quantity: item.pieces,
          ...(item.cost === null ? {} : { unit_cost: item.cost }),
          // The unit ladder is created by the delivery when the medicine has
          // none, which is every medicine this request just invented.
          sell_prices: [
            { unit_name: variant.baseUnit, qty_in_base: 1, price: item.price },
          ],
        });
      }
    }

    let receiptNumber: string | null = null;
    if (!dryRun && receiptLines.length > 0) {
      const receipt = await this.receiptsService.create(
        {
          ...(dto.supplier_id === undefined
            ? {}
            : { supplier_id: dto.supplier_id }),
          note: dto.note?.trim() || 'Bulk stock intake',
          // Settled in full unless the caller says otherwise. A sheet with no
          // costs on it totals nothing and this is moot; a sheet with costs
          // would otherwise land on a supplier's account, and a shop writing
          // down what it already owns is not taking on a debt.
          ...(dto.paid_amount === undefined
            ? {}
            : { paid_amount: dto.paid_amount }),
          items: receiptLines,
        },
        userId,
      );
      receiptNumber = receipt.receiptNumber;
      if (reference !== null) {
        await this.dataSource
          .getRepository(StockReceipt)
          .update({ id: receipt.id }, { intakeReference: reference });
      }
    }

    return {
      dry_run: dryRun,
      receipt_number: receiptNumber,
      total: folded.length,
      matched: lines.filter((l) => l.status === 'matched').length,
      created: lines.filter((l) => l.status === 'created').length,
      ambiguous: lines.filter((l) => l.status === 'ambiguous').length,
      failed: lines.filter((l) => l.status === 'failed').length,
      lines,
    };
  }

  /** The same medicine twice on a sheet is one line with the counts added. */
  private fold(items: StockIntakeItemDto[]): Folded[] {
    const byName = new Map<string, Folded>();
    for (const item of items) {
      const key = item.product.trim().toLowerCase();
      const pieces = countOf(item.piece);
      const existing = byName.get(key);
      if (existing) {
        existing.pieces += pieces;
        continue;
      }
      const price = amount(item.rate, 'rate', item.product);
      if (price === null) {
        throw new BadRequestException({
          message: `"${item.product}": rate is required.`,
          reason: 'intake_rate_required',
        });
      }
      byName.set(key, {
        product: item.product.trim(),
        ...splitName(item.product),
        pieces,
        price,
        cost: amount(item.cost, 'cost', item.product),
      });
    }

    const folded = [...byName.values()];
    const empty = folded.find((f) => f.pieces < 1);
    if (empty) {
      throw new BadRequestException({
        message: `"${empty.product}": no count could be read from the piece field.`,
        reason: 'intake_bad_count',
      });
    }
    return folded;
  }

  /** Every catalogue row the sheet's name could mean. */
  private async candidatesFor(item: Folded): Promise<ProductVariant[]> {
    const rows = await this.dataSource
      .getRepository(ProductVariant)
      .createQueryBuilder('v')
      .innerJoinAndSelect('v.product', 'p')
      .leftJoinAndSelect('p.manufacturer', 'm')
      .where('LOWER(p.brandName) = LOWER(:brand)', { brand: item.brand })
      .andWhere('v.isActive = true')
      .orderBy('v.id', 'ASC')
      .getMany();

    if (item.strength === null) return rows;
    // "Ramil - 2.5" has to land on "2.5 mg", never on "25 mg".
    const exact = rows.filter((v) => firstNumber(v.strength) === item.strength);
    return exact;
  }

  private label(variant: ProductVariant): string {
    return [variant.product?.brandName, variant.strength, variant.dosageForm]
      .filter(Boolean)
      .join(' ');
  }
}
