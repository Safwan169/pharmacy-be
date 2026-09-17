import { ApiProperty } from '@nestjs/swagger';

export class SummaryPeriodDto {
  @ApiProperty({
    example: '2026-07-10',
    description: 'Inclusive start, resolved in the pharmacy’s local timezone.',
  })
  from!: string;

  @ApiProperty({
    example: '2026-07-15',
    description: 'Inclusive end — sales made any time on this day are counted.',
  })
  to!: string;
}

export class DashboardSummaryDto {
  @ApiProperty({
    type: SummaryPeriodDto,
    description:
      'The window actually measured. Echoed back so the UI can label the figures without re-deriving a preset.',
  })
  period!: SummaryPeriodDto;

  @ApiProperty({
    example: 45250.0,
    description:
      'Money actually taken in: the sum of sale totals *after* discount.',
  })
  total_earning!: number;

  @ApiProperty({
    example: 250,
    description: 'Money given back on returns in the period. Already deducted from total_earning.',
  })
  total_refunds!: number;

  @ApiProperty({
    example: 320,
    description: 'Total items sold — the sum of every sold line’s quantity.',
  })
  total_units_sold!: number;

  @ApiProperty({ example: 58, description: 'Number of checkouts.' })
  total_transactions!: number;

  @ApiProperty({
    example: 74,
    description: 'How many different variants sold at least one unit.',
  })
  distinct_products_sold!: number;
}
