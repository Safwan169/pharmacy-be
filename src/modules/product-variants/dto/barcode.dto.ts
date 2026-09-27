import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
