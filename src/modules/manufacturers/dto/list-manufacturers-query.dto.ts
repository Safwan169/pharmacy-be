import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  DEFAULT_PAGE_SIZE,
  LOOKUP_MAX_PAGE_SIZE,
  PaginationQueryDto,
} from '../../../common/dto/pagination-query.dto';

export class ListManufacturersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive substring match on the company name.',
    example: 'ACME',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  search?: string;

  /**
   * Lookup lists (company / ingredient pickers) need every row at once, so
   * this endpoint accepts a much bigger page than the rest of the API.
   */
  @ApiPropertyOptional({ minimum: 1, maximum: LOOKUP_MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LOOKUP_MAX_PAGE_SIZE)
  @IsOptional()
  declare limit: number;
}
