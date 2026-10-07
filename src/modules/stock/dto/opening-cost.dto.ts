import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class OpeningCostDto {
  @ApiProperty({
    example: 16,
    description: 'How far below the selling price the shop buys, in percent.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99)
  percent_below_price!: number;
}

export class OpeningCostResultDto {
  @ApiProperty({ example: 412, description: 'Batches that were given a cost.' })
  batches_costed!: number;

  @ApiProperty({ example: 420000, description: 'What that stock is now worth at cost.' })
  value_at_cost!: number;

  @ApiProperty({
    example: 3,
    description: 'Batches still without a cost because the medicine has no selling price.',
  })
  batches_skipped!: number;
}
