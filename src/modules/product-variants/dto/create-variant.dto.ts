import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PRODUCT_TYPES, type ProductType } from '../../products/entities/product.entity';

/**
 * A medicine that isn't in the imported catalogue. Company and ingredient are
 * given by name and matched case-insensitively to existing rows, so typing
 * "square" attaches to "Square Pharmaceuticals Ltd." rather than creating a
 * near-duplicate.
 */
export class CreateVariantDto {
  @ApiProperty({ example: 'Napa Extend', maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  brand_name!: string;

  @ApiProperty({ example: 'Beximco Pharmaceuticals Ltd.', maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  manufacturer_name!: string;

  @ApiPropertyOptional({ example: 'Paracetamol', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  generic_name?: string;

  @ApiPropertyOptional({ enum: PRODUCT_TYPES, default: 'allopathic' })
  @IsIn(PRODUCT_TYPES)
  @IsOptional()
  type?: ProductType;

  @ApiProperty({ example: 'Tablet', maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  dosage_form!: string;

  @ApiPropertyOptional({ example: '665 mg', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  strength?: string;

  @ApiPropertyOptional({ example: 10, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  @IsOptional()
  pack_size?: number;
}
