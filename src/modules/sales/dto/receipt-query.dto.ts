import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

export class ReceiptQueryDto {
  @ApiPropertyOptional({ enum: [58, 80], description: 'Paper width in mm.' })
  @Type(() => Number)
  @IsIn([58, 80])
  @IsOptional()
  width?: 58 | 80;
}
