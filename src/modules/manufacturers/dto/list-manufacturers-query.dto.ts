import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListManufacturersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive substring match on the company name.',
    example: 'ACME',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  search?: string;
}
