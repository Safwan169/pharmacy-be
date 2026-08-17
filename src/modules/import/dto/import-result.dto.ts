import { ApiProperty } from '@nestjs/swagger';
import { SkippedRow } from '../medicine-csv.parser';

export class SkippedRowDto implements SkippedRow {
  @ApiProperty({
    example: 42,
    description: '1-based line number in the source file.',
  })
  line!: number;

  @ApiProperty({ example: 'unknown "type": homeopathic' })
  reason!: string;
}

export class ImportResultDto {
  @ApiProperty({ example: 21714, description: 'Rows accepted from the file.' })
  rowsParsed!: number;

  @ApiProperty({ example: 0, description: 'Rows rejected as malformed.' })
  rowsSkipped!: number;

  @ApiProperty({
    example: 21714,
    description: 'Variants newly inserted by this run.',
  })
  variantsCreated!: number;

  @ApiProperty({
    example: 0,
    description: 'Variants that already existed and were refreshed in place.',
  })
  variantsUpdated!: number;

  @ApiProperty({
    example: 14013,
    description: 'Parent products in the database after the run.',
  })
  productsTotal!: number;

  @ApiProperty({ example: 232 })
  manufacturersTotal!: number;

  @ApiProperty({ example: 1661 })
  genericsTotal!: number;

  @ApiProperty({ example: 21714 })
  variantsTotal!: number;

  @ApiProperty({ example: 18342 })
  durationMs!: number;

  @ApiProperty({
    type: SkippedRowDto,
    isArray: true,
    description: 'Rejected rows (capped at 100 entries).',
  })
  skipped!: SkippedRowDto[];
}
