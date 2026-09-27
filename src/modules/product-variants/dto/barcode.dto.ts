import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBarcodeDto {
  @ApiProperty({
    example: '8941100010015',
    description: 'Whatever the scanner read. Spaces are stripped and letters upper-cased.',
  })
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  code!: string;

  @ApiPropertyOptional({
    example: 7,
    description:
      'The unit the code is printed on, so a scan rings up that pack. Must be ' +
      "one of the medicine's own units.",
  })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  unit_id?: number;

  @ApiPropertyOptional({
    example: 'strip',
    description: 'Which pack this code is on, when a medicine has more than one.',
  })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  note?: string;
}

/** Leading/trailing junk from a scanner is not part of the code. */
export function normaliseBarcode(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}
