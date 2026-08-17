import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListGenericsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive substring match on the generic name.',
    example: 'paracetamol',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  search?: string;
}
