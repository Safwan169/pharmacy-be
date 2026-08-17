import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** NUMERIC(10,2) tops out at 99,999,999.99. */
const MAX_PRICE = 99_999_999.99;

/**
 * Price and stock are independent: a restock sends stock alone, a re-price
 * sends price alone. Both are therefore optional here.
 *
 * "At least one must be present" is enforced in the service rather than with a
 * custom constraint, because `@IsOptional()` short-circuits *every* validator
 * on a property whose value is undefined — a cross-field check hung off either
 * field would silently never run on the empty body it exists to catch.
 */
export class UpdatePricingDto {
  @ApiPropertyOptional({
    description:
      'Selling price. Two decimal places. Omit to leave the current price untouched.',
    example: 40.12,
    minimum: 0,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRICE)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({
    description:
      'Units in stock. 0 means confirmed out of stock. Omit to leave the current stock untouched.',
    example: 250,
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  stock_quantity?: number;
}
