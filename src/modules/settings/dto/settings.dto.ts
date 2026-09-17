import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SettingsDto {
  @ApiProperty({ example: 'Lubna Pharmacy' })
  shop_name!: string;

  @ApiProperty({ example: '12 Station Road, Dhaka' })
  shop_address!: string;

  @ApiProperty({ example: '01711000000' })
  shop_phone!: string;

  @ApiProperty({ example: 'DL-12345' })
  drug_license_no!: string;

  @ApiProperty({ example: 'Thank you. No returns after 7 days.' })
  receipt_footer!: string;

  @ApiProperty({ example: '5', description: 'Empty means use the server default.' })
  low_stock_threshold!: string;

  @ApiProperty({ example: '80', enum: ['58', '80'] })
  receipt_width_mm!: string;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  shop_name?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  shop_address?: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  shop_phone?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  drug_license_no?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  receipt_footer?: string;

  @ApiPropertyOptional({ description: 'Whole number, or empty for the default.' })
  @Matches(/^(\d{1,6})?$/, { message: 'low_stock_threshold must be a whole number or empty' })
  @IsOptional()
  low_stock_threshold?: string;

  @ApiPropertyOptional({ enum: ['58', '80'] })
  @IsIn(['58', '80'])
  @IsOptional()
  receipt_width_mm?: string;
}
