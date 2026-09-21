import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsNumber,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListSuppliersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Substring match on name or phone.' })
  @IsString()
  @MaxLength(150)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'active' })
  @IsIn(['active', 'inactive', 'all'])
  @IsOptional()
  status?: 'active' | 'inactive' | 'all';
}

export class CreateSupplierPaymentDto {
  @ApiProperty({ example: 5000, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty({ enum: ['cash', 'bkash'] })
  @IsIn(['cash', 'bkash'])
  method!: 'cash' | 'bkash';

  @ApiPropertyOptional({ maxLength: 50, description: 'bKash TrxID, cheque number…' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  note?: string;
}

export class DueSupplierDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty() due_balance!: number;
  @ApiProperty({ nullable: true, description: 'Date of the oldest delivery still unpaid.' })
  oldest_due_at!: string | null;
  @ApiProperty() open_receipts!: number;
}

export class CreateSupplierDto {
  @ApiProperty({ example: 'Square Distribution', maxLength: 150 })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: '01711000000', maxLength: 30 })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  address?: string;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional({ maxLength: 150 })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ maxLength: 30, nullable: true })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  phone?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  address?: string | null;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
