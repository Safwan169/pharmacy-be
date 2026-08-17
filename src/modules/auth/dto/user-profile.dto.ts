import { ApiProperty } from '@nestjs/swagger';

/** What `GET /auth/me` returns — never includes the password hash. */
export class UserProfileDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'admin@example.com', format: 'email' })
  email!: string;

  @ApiProperty({ example: 'admin' })
  role!: string;
}
