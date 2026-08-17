import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListSalesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive substring match on the invoice number.',
    example: 'INV-20260817',
  })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  search?: string;

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
