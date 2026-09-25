import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, Matches } from 'class-validator';
import { CIVIL_DATE_PATTERN } from '../../dashboard/date-range';

export class DailyClosingQueryDto {
  @ApiPropertyOptional({ example: '2026-09-17', description: 'Defaults to today.' })
  @Matches(CIVIL_DATE_PATTERN, { message: 'date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'date must be a real calendar date' })
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({ enum: ['json', 'csv'], default: 'json' })
  @IsIn(['json', 'csv'])
  @IsOptional()
  format?: 'json' | 'csv';
}

export class ProfitQueryDto {
  @ApiProperty({ example: '2026-09-01' })
  @Matches(CIVIL_DATE_PATTERN, { message: 'from must be YYYY-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'from must be a real calendar date' })
  from!: string;

  @ApiProperty({ example: '2026-09-30' })
  @Matches(CIVIL_DATE_PATTERN, { message: 'to must be YYYY-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'to must be a real calendar date' })
  to!: string;

  @ApiPropertyOptional({ enum: ['json', 'csv'], default: 'json' })
  @IsIn(['json', 'csv'])
  @IsOptional()
  format?: 'json' | 'csv';
}

export class MethodBreakdownDto {
  @ApiProperty({ example: 12000 }) cash!: number;
  @ApiProperty({ example: 3500 }) bkash!: number;
  @ApiProperty({ example: 800 }) due!: number;
}

export class ClosingTopItemDto {
  @ApiProperty() variant_id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() amount!: number;
}

export class ClosingCashierDto {
  @ApiProperty() user_id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() sales_count!: number;
  @ApiProperty() amount!: number;
}

export class DailyClosingDto {
  @ApiProperty({ example: '2026-09-17' }) date!: string;
  @ApiProperty() sales_count!: number;
  @ApiProperty({ description: 'Sum of sale totals (after discount), voided excluded.' }) gross_sales!: number;
  @ApiProperty() discounts!: number;
  @ApiProperty() refunds!: number;
  @ApiProperty({ description: 'gross_sales - refunds' }) net_sales!: number;
  @ApiProperty({ type: MethodBreakdownDto }) by_method!: MethodBreakdownDto;
  @ApiProperty({ description: 'Refunds paid out, by method.' }) refunds_by_method!: { cash: number; bkash: number; due_adjust: number };
  @ApiProperty({ description: 'Due balances collected today, by method.' }) due_collected!: { cash: number; bkash: number };
  @ApiProperty({
    description:
      'Paid to suppliers today (at deliveries and against balances), by method. ' +
      '`cash_outside` is the part of `cash` that came from a bank account or the ' +
      "owner's pocket rather than the drawer.",
  })
  supplier_paid!: { cash: number; bkash: number; cash_outside: number };
  @ApiProperty({
    nullable: true,
    description:
      'Cash the drawer should have held when the day started: everything it has ' +
      'taken in and paid out since the shop began. Null on a single cashier’s ' +
      'view, where a shop-wide balance would mean nothing.',
  })
  opening_cash!: number | null;
  @ApiProperty({ description: 'opening_cash + cash sales + cash due collections - cash refunds - cash paid to suppliers out of the drawer.' }) cash_in_drawer_expected!: number;
  @ApiProperty() voided_count!: number;
  @ApiProperty({ type: ClosingTopItemDto, isArray: true }) top_items!: ClosingTopItemDto[];
  @ApiProperty({ type: ClosingCashierDto, isArray: true }) cashier_breakdown!: ClosingCashierDto[];
}

export class ProfitDayDto {
  @ApiProperty({ example: '2026-09-17' }) date!: string;
  @ApiProperty() revenue!: number;
  @ApiProperty() cogs!: number;
  @ApiProperty() gross_profit!: number;
  @ApiProperty({ nullable: true }) margin_pct!: number | null;
  @ApiProperty({ description: 'Lines sold from batches with no recorded cost.' }) uncosted_lines!: number;
}

export class ProfitProductDto {
  @ApiProperty() variant_id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() quantity_base!: number;
  @ApiProperty() revenue!: number;
  @ApiProperty() cogs!: number;
  @ApiProperty() gross_profit!: number;
}

export class ProfitReportDto {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty({ type: ProfitDayDto }) total!: ProfitDayDto;
  @ApiProperty({ type: ProfitDayDto, isArray: true }) by_day!: ProfitDayDto[];
  @ApiProperty({ type: ProfitProductDto, isArray: true }) by_product!: ProfitProductDto[];
}

export class StockValueDto {
  @ApiProperty({ description: 'Sum of quantity x cost over unexpired batches.' }) value_at_cost!: number;
  @ApiProperty({ description: 'Sum of quantity x default selling price over unexpired batches.' }) value_at_price!: number;
  @ApiProperty() expired_value_at_cost!: number;
  @ApiProperty({ description: 'Base units held in batches with no cost recorded.' }) uncosted_units!: number;
  @ApiProperty() batches_in_stock!: number;
  @ApiProperty() variants_in_stock!: number;
}
