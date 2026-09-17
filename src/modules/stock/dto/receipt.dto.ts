import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MOVEMENT_TYPES } from '../entities/stock-movement.entity';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class ReceiptLineDto {
  @ApiProperty({ example: 123 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  variant_id!: number;

  @ApiPropertyOptional({
    example: 12,
    description:
      'variant_units.id the delivery is counted in (e.g. box). Omit to count in the base unit.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  unit_id?: number;

  @ApiProperty({ example: 5, minimum: 1, description: 'In that unit.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity!: number;

  @ApiProperty({ example: 950, description: 'Cost per unit bought, before VAT.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  unit_cost!: number;

  @ApiPropertyOptional({ example: 'B2409A', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  batch_no?: string;

  @ApiPropertyOptional({ example: '2027-03-31', description: 'YYYY-MM-DD. Must not be in the past.' })
  @Matches(DATE_ONLY, { message: 'expiry_date must be YYYY-MM-DD' })
  @IsDateString()
  @IsOptional()
  expiry_date?: string;
}

export class CreateReceiptDto {
  @ApiPropertyOptional({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  supplier_id?: number;

  @ApiPropertyOptional({ example: 'SQ-88213', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  supplier_invoice_no?: string;

  @ApiPropertyOptional({ example: '2026-09-17', description: 'Defaults to today.' })
  @Matches(DATE_ONLY, { message: 'received_at must be YYYY-MM-DD' })
  @IsDateString()
  @IsOptional()
  received_at?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  note?: string;

  @ApiProperty({ type: ReceiptLineDto, isArray: true, minItems: 1 })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  items!: ReceiptLineDto[];
}

export class ListReceiptsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Receipt number or supplier invoice number.' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  supplier_id?: number;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @Matches(DATE_ONLY)
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @Matches(DATE_ONLY)
  @IsOptional()
  to?: string;
}

export class ListMovementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 123 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  variant_id?: number;

  @ApiPropertyOptional({ enum: MOVEMENT_TYPES })
  @IsIn(MOVEMENT_TYPES)
  @IsOptional()
  type?: (typeof MOVEMENT_TYPES)[number];

  @ApiPropertyOptional({ example: '2026-09-01' })
  @Matches(DATE_ONLY)
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @Matches(DATE_ONLY)
  @IsOptional()
  to?: string;
}

/** One rejected receipt line. */
export class ReceiptLineFailureDto {
  @ApiProperty({ example: 0, description: 'Index in the submitted items array.' })
  index!: number;

  @ApiProperty({ example: 123 })
  variant_id!: number;

  @ApiProperty({
    enum: ['not_found', 'inactive', 'unit_not_found', 'expired_batch'],
  })
  reason!: 'not_found' | 'inactive' | 'unit_not_found' | 'expired_batch';

  @ApiProperty()
  message!: string;
}
