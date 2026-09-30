import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CIVIL_DATE_PATTERN } from '../../dashboard/date-range';

export class CloseDayDto {
  @ApiPropertyOptional({ example: '2026-09-30', description: 'Defaults to today.' })
  @Matches(CIVIL_DATE_PATTERN, { message: 'date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'date must be a real calendar date' })
  @IsOptional()
  date?: string;

  @ApiProperty({ example: 9100, description: 'What counting the drawer found.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999)
  counted_cash!: number;

  @ApiPropertyOptional({
    example: 'lunch, rickshaw',
    description: 'Where the difference went, if the owner knows.',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  note?: string;
}
