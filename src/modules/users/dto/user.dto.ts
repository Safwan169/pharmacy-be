import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ROLES } from '../../../common/roles';
import type { Role } from '../../../common/roles';

export class UserDto {
  @ApiProperty({ example: 2 })
  id!: number;

  @ApiProperty({ example: 'rahim@shop.com' })
  email!: string;

  @ApiProperty({ example: 'Rahim', nullable: true })
  name!: string | null;

  @ApiProperty({ enum: ROLES, example: 'cashier' })
  role!: string;

  @ApiProperty({ example: true })
  is_active!: boolean;

  @ApiProperty()
  created_at!: Date;
}

export class CreateUserDto {
  @ApiProperty({ example: 'Rahim', maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'rahim@shop.com' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: ROLES, example: 'cashier' })
  @IsIn(ROLES)
  role!: Role;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ enum: ROLES })
  @IsIn(ROLES)
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
