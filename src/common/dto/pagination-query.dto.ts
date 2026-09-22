import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
/** For pickers that must list every company / ingredient in one go. */
export const LOOKUP_MAX_PAGE_SIZE = 5000;

export class PaginationQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    default: 1,
    description: '1-based page number.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
    description: 'Rows per page.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  @IsOptional()
  limit: number = DEFAULT_PAGE_SIZE;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
