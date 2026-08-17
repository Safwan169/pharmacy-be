import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Email address of the admin account.',
    example: 'admin@example.com',
    format: 'email',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'Plain-text password, checked against the stored bcrypt hash.',
    example: 'change-me-too',
    format: 'password',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
