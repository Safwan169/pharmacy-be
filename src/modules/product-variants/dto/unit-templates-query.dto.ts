import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UnitTemplatesQueryDto {
  @ApiPropertyOptional({ example: 'Tablet' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  dosage_form?: string;

  @ApiPropertyOptional({ example: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  pack_size?: number;
}
