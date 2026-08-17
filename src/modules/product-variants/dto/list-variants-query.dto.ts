import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PRODUCT_TYPES } from '../../products/entities/product.entity';
// Type-only: it appears in a decorated signature under isolatedModules.
import type { ProductType } from '../../products/entities/product.entity';

export const PRICING_STATUSES = ['missing', 'set'] as const;
export type PricingStatus = (typeof PRICING_STATUSES)[number];

export const VARIANT_STATUSES = ['active', 'inactive', 'all'] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];

export class ListVariantsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Case-insensitive substring match on brand name or generic name.',
    example: 'napa',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by manufacturer.', example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  manufacturer_id?: number;

  @ApiPropertyOptional({
    description: 'Filter by generic / active ingredient.',
    example: 5,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  generic_id?: number;

  @ApiPropertyOptional({ description: 'Exact dosage form.', example: 'Tablet' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  dosage_form?: string;

  @ApiPropertyOptional({ enum: PRODUCT_TYPES })
  @IsEnum(PRODUCT_TYPES)
  @IsOptional()
  type?: ProductType;

  @ApiPropertyOptional({
    enum: PRICING_STATUSES,
    description:
      '`missing` is the admin "needs pricing" worklist (price IS NULL); `set` is everything already priced.',
  })
  @IsEnum(PRICING_STATUSES)
  @IsOptional()
  pricing_status?: PricingStatus;

  @ApiPropertyOptional({
    enum: VARIANT_STATUSES,
    default: 'active',
    description:
      'Withdrawn SKUs are hidden by default. Use `inactive` to review what was ' +
      'deactivated (and restore it), or `all` to see both.',
  })
  @IsEnum(VARIANT_STATUSES)
  @IsOptional()
  status?: VariantStatus;
}
