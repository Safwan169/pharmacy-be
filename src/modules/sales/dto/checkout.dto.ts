import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { DISCOUNT_TYPES, PAYMENT_METHODS } from '../entities/sale.entity';
import type { DiscountType } from '../entities/sale.entity';

export class CheckoutItemDto {
  @ApiProperty({ example: 123, description: 'product_variants.id' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  variant_id!: number;

  @ApiProperty({ example: 12, description: 'variant_units.id - the unit sold.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unit_id!: number;

  @ApiProperty({ example: 2, minimum: 1, description: 'In that unit.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

/** A percentage discount is capped at 100; a flat one only has to be non-negative. */
@ValidatorConstraint({ name: 'discountValueInRange' })
class DiscountValueInRange implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const { type } = args.object as DiscountDto;
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
      return false;
    }
    return type === 'percentage' ? value <= 100 : true;
  }

  defaultMessage(args: ValidationArguments): string {
    const { type } = args.object as DiscountDto;
    return type === 'percentage'
      ? 'discount.value must be a number between 0 and 100 for a percentage discount'
      : 'discount.value must be a number of at least 0 for a flat discount';
  }
}

export class DiscountDto {
  @ApiProperty({ enum: DISCOUNT_TYPES, example: 'percentage' })
  @IsEnum(DISCOUNT_TYPES)
  type!: DiscountType;

  @ApiProperty({
    example: 10,
    description:
      '10 means "10%" for a percentage discount, or a flat 10 in currency.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Validate(DiscountValueInRange)
  value!: number;
}

export class InlineCustomerDto {
  @ApiProperty({ example: 'Karim Uddin', maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: '01711000000', maxLength: 20 })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  phone?: string;
}

export class CheckoutDto {
  @ApiProperty({ type: CheckoutItemDto, isArray: true, minItems: 1 })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @ApiPropertyOptional({
    type: DiscountDto,
    description: 'Applies once to the whole checkout. Omit for no discount.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  discount?: DiscountDto;

  @ApiProperty({
    enum: PAYMENT_METHODS,
    example: 'cash',
    description: '`due` needs `customer_id` or an inline `customer`.',
  })
  @IsIn(PAYMENT_METHODS)
  payment_method!: (typeof PAYMENT_METHODS)[number];

  @ApiPropertyOptional({
    example: 500,
    description: 'Cash only: what the customer handed over. Change is computed.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  @IsOptional()
  amount_tendered?: number;

  @ApiPropertyOptional({ example: 'BKD7X1A2', maxLength: 30, description: 'bKash only.' })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  bkash_trx_id?: string;

  @ApiPropertyOptional({ example: 3, description: 'Due only: an existing customer.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  customer_id?: number;

  @ApiPropertyOptional({
    type: () => InlineCustomerDto,
    description: 'Due only: create the customer on the spot instead of customer_id.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => InlineCustomerDto)
  customer?: InlineCustomerDto;
}
