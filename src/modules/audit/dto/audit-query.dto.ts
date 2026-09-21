import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'variant' })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  entity_type?: string;

  @ApiPropertyOptional({ example: 2552 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  entity_id?: number;
}
