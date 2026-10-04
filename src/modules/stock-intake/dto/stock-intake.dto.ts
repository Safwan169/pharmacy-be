import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class StockIntakeItemDto {
  @ApiProperty({
    example: 'Ramil - 2.5',
    description:
      'The medicine as the sheet writes it. A trailing number after a dash or ' +
      'a space is read as the strength: "Ramil - 2.5" is Ramil 2.5 mg.',
  })
  @IsString()
  @MaxLength(255)
  product!: string;

  @ApiProperty({
    example: '88 P',
    description:
      'How many, in the medicine’s base unit. The first run of digits is ' +
      'taken, so "88 P", "88" and "88 pcs" are the same.',
  })
  @IsString()
  @MaxLength(50)
  piece!: string;

  @ApiProperty({
    example: '5',
    description: 'Selling price of one base unit.',
  })
  @IsString()
  @MaxLength(20)
  rate!: string;

  @ApiPropertyOptional({
    example: '3.5',
    description:
      'What one base unit cost, when it is known. Left out, the batch is ' +
      'stored without a cost and the reports say so rather than counting it ' +
      'as free.',
  })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  cost?: string;
}

export class StockIntakeDto {
  @ApiProperty({
    type: StockIntakeItemDto,
    isArray: true,
    description:
      'The sheet, as it stands. The same medicine listed twice is one line ' +
      'with the counts added together.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => StockIntakeItemDto)
  items!: StockIntakeItemDto[];

  @ApiPropertyOptional({
    example: true,
    default: false,
    description:
      'Work out what would happen and report it, writing nothing. The answer ' +
      'has the same shape, so the real request can be the same call with this ' +
      'turned off.',
  })
  @IsBoolean()
  @IsOptional()
  dry_run?: boolean;

  @ApiPropertyOptional({
    example: 'popular-2026-10-04',
    maxLength: 100,
    description:
      'A name for this sheet. Sending the same one twice is refused rather ' +
      'than doubling every count on it.',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional({
    example: 0,
    description:
      'What has been paid for this delivery. Left out, it counts as settled ' +
      'in full — which is what writing down stock you already own means. ' +
      'Send less than the total to put the rest on a supplier’s account, ' +
      'which then needs supplier_id.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  paid_amount?: number;

  @ApiPropertyOptional({ example: 3, description: 'Who it came from.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  supplier_id?: number;

  @ApiPropertyOptional({ example: 'Opening stock', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({
    example: 'Popular Pharmaceuticals Ltd.',
    maxLength: 255,
    description:
      'The company to file medicines under that the catalogue does not have ' +
      'yet. Required only if any line turns out to be new.',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  default_manufacturer?: string;

  @ApiPropertyOptional({
    example: 'Tablet',
    default: 'Tablet',
    maxLength: 100,
    description: 'The form to give medicines the catalogue does not have yet.',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  default_dosage_form?: string;
}

export type IntakeLineStatus = 'matched' | 'created' | 'ambiguous' | 'failed';

export class StockIntakeLineDto {
  @ApiProperty({ example: 'Ramil - 2.5' }) product!: string;
  @ApiProperty({ enum: ['matched', 'created', 'ambiguous', 'failed'] })
  status!: IntakeLineStatus;
  @ApiProperty({ example: 88, description: 'After adding up repeats.' })
  pieces!: number;
  @ApiProperty({ example: 5 }) price!: number;
  @ApiPropertyOptional({ example: 3.5, nullable: true }) cost?: number | null;
  @ApiPropertyOptional({ example: 16447, nullable: true })
  variant_id?: number | null;
  @ApiPropertyOptional({ example: 'Ramil 2.5 mg Tablet' })
  matched_as?: string;
  @ApiPropertyOptional({
    example: ['Ebatin 10 mg Tablet', 'Ebatin 5 mg/5 ml Syrup'],
    description:
      'Set when the name fits more than one medicine. Nothing is guessed.',
  })
  options?: string[];
  @ApiPropertyOptional({
    example: 'That brand, strength and form already exists.',
  })
  message?: string;
}

export class StockIntakeResultDto {
  @ApiProperty({ example: false }) dry_run!: boolean;
  @ApiProperty({
    example: 'GRN-20261004-0001',
    nullable: true,
    description: 'Null on a dry run, and when no line could be used.',
  })
  receipt_number!: string | null;
  @ApiProperty({ example: 42, description: 'Lines after adding up repeats.' })
  total!: number;
  @ApiProperty({ example: 28 }) matched!: number;
  @ApiProperty({ example: 13 }) created!: number;
  @ApiProperty({ example: 1 }) ambiguous!: number;
  @ApiProperty({ example: 0 }) failed!: number;
  @ApiProperty({ type: StockIntakeLineDto, isArray: true })
  lines!: StockIntakeLineDto[];
}
