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
  Min,
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

  @ApiPropertyOptional({
    enum: PAYMENT_METHODS,
    default: 'cash',
    description: 'Cash is the only method supported today.',
  })
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  payment_method?: string;
}
