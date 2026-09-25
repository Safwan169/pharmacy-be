import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListSalesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['completed', 'voided', 'returned', 'partial_return', 'all'],
    default: 'all',
  })
  @IsIn(['completed', 'voided', 'returned', 'partial_return', 'all'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    description:
      'Case-insensitive substring match on the invoice number, the customer ' +
      "name or phone, or a medicine sold on the bill — so a counter looking " +
      'for a sale to reverse can search by what the customer is holding.',
    example: 'napa',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description:
      'Include each sale\'s line items. The counter needs them to offer a ' +
      'return without a second request per sale.',
    default: false,
  })
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  @IsOptional()
  with_items?: boolean;

  @ApiPropertyOptional({
    description:
      'Inclusive lower bound on the checkout date (ISO date or date-time).',
    example: '2026-08-01',
  })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    description:
      'Inclusive upper bound. A bare date covers the whole day — `2026-08-17` includes everything up to 23:59:59.999.',
    example: '2026-08-31',
  })
  @IsDateString()
  @IsOptional()
  to?: string;
}
