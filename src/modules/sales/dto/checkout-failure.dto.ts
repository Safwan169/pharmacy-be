import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CHECKOUT_FAILURE_REASONS = [
  'not_found',
  'inactive',
  'not_priced',
  'unit_not_found',
  'unit_not_sellable',
  'insufficient_stock',
  'duplicate_item',
  'stock_changed',
] as const;
export type CheckoutFailureReason = (typeof CHECKOUT_FAILURE_REASONS)[number];

/** One rejected line, detailed enough that the client needs no second lookup. */
export class CheckoutItemFailureDto {
  @ApiProperty({ example: 456 })
  variant_id!: number;

  @ApiPropertyOptional({ example: 12, description: 'The unit that was asked for.' })
  unit_id?: number;

  @ApiProperty({
    enum: CHECKOUT_FAILURE_REASONS,
    example: 'insufficient_stock',
  })
  reason!: CheckoutFailureReason;

  @ApiProperty({ example: 'Only 3 in stock, 5 requested.' })
  message!: string;

  @ApiPropertyOptional({ example: 5 })
  requested_quantity?: number;

  @ApiPropertyOptional({
    example: 3,
    description:
      'Stock on hand when the check ran, in the requested unit. Absent if the ' +
      'variant has no price yet.',
  })
  available_quantity?: number;
}

export class CheckoutRejectedDto {
  @ApiProperty({ example: 422 })
  statusCode!: number;

  @ApiProperty({
    example:
      'Checkout rejected: no stock was deducted and no sale was recorded.',
  })
  message!: string;

  @ApiProperty({ type: CheckoutItemFailureDto, isArray: true })
  errors!: CheckoutItemFailureDto[];
}
