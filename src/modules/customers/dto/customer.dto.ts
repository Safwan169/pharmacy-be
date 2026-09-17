import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { DUE_PAYMENT_METHODS } from '../entities/customer.entity';
import type { DuePaymentMethod } from '../entities/customer.entity';

export class ListCustomersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Name or phone substring.' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Only customers who owe money.' })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  has_due?: boolean;
}

export class CreateCustomerDto {
  @ApiProperty({ example: 'Karim Uddin', maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: '01711000000', maxLength: 20 })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  address?: string;
}

export class UpdateCustomerDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsString()
  @MaxLength(20)
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

export class CreateDuePaymentDto {
  @ApiProperty({ example: 200, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  amount!: number;

  @ApiProperty({ enum: DUE_PAYMENT_METHODS, example: 'cash' })
  @IsIn(DUE_PAYMENT_METHODS)
  method!: DuePaymentMethod;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  bkash_trx_id?: string;

  @ApiPropertyOptional({ example: 42, description: 'Sale being paid off, if a specific one.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sale_id?: number;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  note?: string;
}

/** A customer row with the age of their oldest unpaid sale, for the due list. */
export class DueCustomerDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Karim Uddin' })
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  phone!: string | null;

  @ApiProperty({ example: 450 })
  due_balance!: number;

  @ApiPropertyOptional({ nullable: true, description: 'Date of the oldest sale still owed on.' })
  oldest_due_at!: string | null;

  @ApiProperty({ example: 3 })
  open_sales!: number;
}
