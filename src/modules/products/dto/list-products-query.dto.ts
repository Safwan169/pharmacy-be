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
import { PRODUCT_TYPES } from '../entities/product.entity';
// Type-only: it appears in a decorated signature under isolatedModules.
import type { ProductType } from '../entities/product.entity';

export class ListProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive substring match on the brand name.',
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

  @ApiPropertyOptional({ enum: PRODUCT_TYPES })
  @IsEnum(PRODUCT_TYPES)
  @IsOptional()
  type?: ProductType;
}
