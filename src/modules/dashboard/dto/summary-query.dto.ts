import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, Matches } from 'class-validator';
import { CIVIL_DATE_PATTERN, PERIODS } from '../date-range';
// Type-only: it appears in a decorated signature under isolatedModules.
import type { Period } from '../date-range';

/**
 * `from`/`to` and `period` are alternatives. Send both halves of a custom range
 * and it wins outright; send neither and `period` applies, defaulting to today.
 */
export class SummaryQueryDto {
  @ApiPropertyOptional({
    enum: PERIODS,
    default: 'today',
    description:
      'Preset window, resolved against the pharmacy’s local calendar. Ignored when `from`/`to` are sent.',
  })
  @IsEnum(PERIODS)
  @IsOptional()
  period?: Period;

  @ApiPropertyOptional({
    example: '2026-07-10',
    description:
      'Inclusive start of a custom range. Must be sent together with `to`.',
  })
  // Matches pins the shape to a bare date; IsISO8601 strict then rejects
  // calendar-impossible ones like 2026-02-30, which the pattern alone allows.
  @Matches(CIVIL_DATE_PATTERN, {
    message: 'from must be a bare YYYY-MM-DD date',
  })
  @IsISO8601({ strict: true }, { message: 'from must be a real calendar date' })
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-07-15',
    description:
      'Inclusive end of a custom range — the whole of this day counts. Must be sent together with `from`.',
  })
  @Matches(CIVIL_DATE_PATTERN, { message: 'to must be a bare YYYY-MM-DD date' })
  @IsISO8601({ strict: true }, { message: 'to must be a real calendar date' })
  @IsOptional()
  to?: string;
}
