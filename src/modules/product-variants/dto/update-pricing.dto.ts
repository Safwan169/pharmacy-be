import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** NUMERIC(10,2) tops out at 99,999,999.99. */
const MAX_PRICE = 99_999_999.99;

/** One rung of the unit ladder — "strip of 10 at 12.00". */
export class UnitInputDto {
  @ApiProperty({ example: 'strip', maxLength: 30 })
  @IsString()
  @MaxLength(30)
  @Matches(/^[a-z][a-z0-9 _-]*$/i, {
    message: 'name must be letters, numbers, spaces, - or _',
  })
  name!: string;

  @ApiProperty({ example: 10, minimum: 1, description: 'Base units in one.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  qty_in_base!: number;

  @ApiPropertyOptional({ example: 12, nullable: true, minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRICE)
  @IsOptional()
  price?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  is_sellable?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Exactly one unit must be the default.',
  })
  @IsBoolean()
  @IsOptional()
  is_default?: boolean;
}

/**
 * Units, price and stock are independent: a restock sends stock alone, a
 * re-price sends units alone. All fields are therefore optional here.
 *
 * "At least one must be present" is enforced in the service rather than with a
 * custom constraint, because `@IsOptional()` short-circuits *every* validator
 * on a property whose value is undefined — a cross-field check hung off either
 * field would silently never run on the empty body it exists to catch.
 */
export class UpdatePricingDto {
  @ApiPropertyOptional({
    description:
      'Shortcut: price of the base unit (qty_in_base = 1). Creates that unit ' +
      'row if missing. Ignored when `units` is sent.',
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
      'Count in the base unit. 0 means confirmed out of stock. Omit to leave ' +
      'the current stock untouched.',
    example: 250,
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  stock_quantity?: number;

  @ApiPropertyOptional({
    example: 'Recounted shelf',
    maxLength: 255,
    description: 'Why the count changed. Stored on the adjustment movement.',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  stock_note?: string;

  @ApiPropertyOptional({
    example: 50,
    nullable: true,
    minimum: 0,
    description:
      'Restock below this many base units. Send null to fall back to the ' +
      'shop-wide setting.',
  })
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  @IsOptional()
  reorder_level?: number | null;

  @ApiPropertyOptional({
    type: UnitInputDto,
    isArray: true,
    description:
      'The full sellable-unit ladder. Replaces the existing one: units not ' +
      'listed are removed. Exactly one must be `is_default`.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => UnitInputDto)
  @IsOptional()
  units?: UnitInputDto[];
}
