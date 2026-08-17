import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One variant that needs restocking. Flattened out of the variant/product/
 * manufacturer join so the dashboard widget can render a row without walking
 * relations, and computed live — there is no alerts table to go stale.
 */
export class LowStockItemDto {
  @ApiProperty({
    example: 123,
    description: 'The variant to restock — use it to open the pricing screen.',
  })
  variant_id!: number;

  @ApiProperty({ example: 'Napa' })
  brand_name!: string;

  @ApiProperty({ example: 'Tablet' })
  dosage_form!: string;

  @ApiPropertyOptional({ example: '500 mg', nullable: true })
  strength!: string | null;

  @ApiProperty({ example: 'Beximco Pharmaceuticals Ltd.' })
  manufacturer!: string;

  @ApiProperty({
    example: 2,
    description: 'Units left. 0 means confirmed out of stock.',
  })
  stock_quantity!: number;
}
