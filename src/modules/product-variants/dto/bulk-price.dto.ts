import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class BulkPriceDto {
  @ApiPropertyOptional({ example: 12 })
  @Type(() => Number) @IsInt() @Min(1) @IsOptional()
  manufacturer_id?: number;

  @ApiPropertyOptional({ example: 5 })
  @Type(() => Number) @IsInt() @Min(1) @IsOptional()
  generic_id?: number;

  @ApiPropertyOptional({ example: 'napa', description: 'Brand or ingredient contains…' })
  @IsString() @MaxLength(100) @IsOptional()
  search?: string;

  @ApiPropertyOptional({ example: 5, description: 'Percentage change; negative lowers prices.' })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(-90) @Max(500) @IsOptional()
  percent?: number;

  @ApiPropertyOptional({ example: 2, description: 'Fixed change per unit price; negative lowers.' })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(-100000) @Max(100000) @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ enum: [0.01, 0.5, 1], default: 0.5, description: 'Round new prices to this.' })
  @Type(() => Number) @IsIn([0.01, 0.5, 1]) @IsOptional()
  round_to?: number;

  @ApiPropertyOptional({ default: true, description: 'true = preview only, nothing saved.' })
  @IsBoolean() @IsOptional()
  dry_run?: boolean;
}

export class BulkPriceRowDto {
  @ApiProperty() variant_id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty() old_price!: number;
  @ApiProperty() new_price!: number;
}

export class BulkPricePreviewDto {
  @ApiProperty() dry_run!: boolean;
  @ApiProperty({ description: 'Medicines affected.' }) variants!: number;
  @ApiProperty({ description: 'Unit prices that would change.' }) unit_prices!: number;
  @ApiProperty({ type: BulkPriceRowDto, isArray: true, description: 'First 25 changes.' }) sample!: BulkPriceRowDto[];
}
