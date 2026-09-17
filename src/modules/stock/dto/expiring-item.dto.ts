import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const EXPIRY_WINDOWS = [30, 60, 90] as const;

export class ExpiringQueryDto {
  @ApiPropertyOptional({ enum: EXPIRY_WINDOWS, default: 30 })
  @Type(() => Number)
  @IsIn(EXPIRY_WINDOWS)
  @IsOptional()
  days?: number;
}

export class WriteOffDto {
  @ApiPropertyOptional({ example: 'Expired on shelf', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  note?: string;
}

/** One batch that is expiring or already expired, flattened for the widget. */
export class ExpiringItemDto {
  @ApiProperty({ example: 7 })
  batch_id!: number;

  @ApiProperty({ example: 123 })
  variant_id!: number;

  @ApiProperty({ example: 'Napa' })
  brand_name!: string;

  @ApiProperty({ example: 'Tablet' })
  dosage_form!: string;

  @ApiPropertyOptional({ example: '500 mg', nullable: true })
  strength!: string | null;

  @ApiProperty({ example: 'Beximco Pharmaceuticals Ltd.' })
  manufacturer!: string;

  @ApiPropertyOptional({ example: 'B2409A', nullable: true })
  batch_no!: string | null;

  @ApiProperty({ example: '2026-10-15' })
  expiry_date!: string;

  @ApiProperty({ example: 12, description: 'Negative once expired.' })
  days_left!: number;

  @ApiProperty({ example: 140 })
  quantity!: number;

  @ApiProperty({ example: 'tablet' })
  base_unit!: string;

  @ApiPropertyOptional({
    example: 133,
    nullable: true,
    description: 'quantity * cost_price. Null when the batch has no cost.',
  })
  value_at_cost!: number | null;
}
