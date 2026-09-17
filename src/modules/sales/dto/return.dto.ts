import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { REFUND_METHODS } from '../entities/sale-return.entity';
import type { RefundMethod } from '../entities/sale-return.entity';

export class VoidSaleDto {
  @ApiProperty({ example: 'Rang up the wrong customer', maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  reason!: string;
}

export class ReturnLineDto {
  @ApiProperty({ example: 7, description: 'sale_items.id' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sale_item_id!: number;

  @ApiProperty({ example: 1, minimum: 1, description: 'In the unit it was sold in.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    default: true,
    description: 'False if the goods are damaged and must not go back on the shelf.',
  })
  @IsBoolean()
  @IsOptional()
  restock?: boolean;
}

export class CreateReturnDto {
  @ApiProperty({ type: ReturnLineDto, isArray: true, minItems: 1 })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  items!: ReturnLineDto[];

  @ApiProperty({ enum: REFUND_METHODS, example: 'cash' })
  @IsIn(REFUND_METHODS)
  refund_method!: RefundMethod;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  reason?: string;
}

export const RETURN_FAILURE_REASONS = [
  'sale_item_not_found',
  'too_many',
  'duplicate_item',
] as const;

export class ReturnLineFailureDto {
  @ApiProperty({ example: 7 })
  sale_item_id!: number;

  @ApiProperty({ enum: RETURN_FAILURE_REASONS })
  reason!: (typeof RETURN_FAILURE_REASONS)[number];

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional({ example: 2, description: 'How many can still be returned.' })
  returnable_quantity?: number;
}
