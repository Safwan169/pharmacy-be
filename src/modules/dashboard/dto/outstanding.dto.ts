import { ApiProperty } from '@nestjs/swagger';

/** Credit in both directions — what is owed to the shop, and by it. */
export class OutstandingDto {
  @ApiProperty({
    example: 4250.0,
    description: 'Total still owed by customers who bought on account.',
  })
  customers_owe!: number;

  @ApiProperty({ example: 12, description: 'How many customers owe anything.' })
  customers_count!: number;

  @ApiProperty({
    example: '2026-08-14',
    nullable: true,
    description: 'Date of the oldest unpaid sale on account, or null when nobody owes.',
  })
  customers_oldest!: string | null;

  @ApiProperty({
    example: 18600.0,
    description: 'Total the shop still owes suppliers for deliveries taken on credit.',
  })
  shop_owes!: number;

  @ApiProperty({ example: 3, description: 'How many suppliers are owed anything.' })
  suppliers_count!: number;

  @ApiProperty({
    example: '2026-07-30',
    nullable: true,
    description: 'Date of the oldest unpaid delivery, or null when nothing is owed.',
  })
  suppliers_oldest!: string | null;
}
