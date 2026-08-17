import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { User } from './entities/user.entity';

/** Claims carried by the access token. */
export interface JwtPayload {
  sub: number;
  email: string;
}

/**
 * A real bcrypt hash of a value nobody knows. Compared against when the email
 * doesn't exist so that a failed login costs the same time either way — without
 * it, the response latency alone reveals which emails are registered.
 */
const UNKNOWN_USER_DUMMY_HASH =
  '$2b$12$H1MXz1beDs9vA9EPpemR6.uCA7umUiPmrnMGjNb1Bv4cJBIdwFDuK';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { email: normalizeEmail(loginDto.email) },
    });

    const passwordMatches = await bcrypt.compare(
      loginDto.password,
      user?.passwordHash ?? UNKNOWN_USER_DUMMY_HASH,
    );

    // One message for both failure modes: never disclose whether the email exists.
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = { sub: user.id, email: user.email };
    return { access_token: await this.jwtService.signAsync(payload) };
  }

  /** Resolves the token subject against the database on every request, so a
   * deleted user's still-unexpired token stops working immediately. */
  async findAuthenticatedUserById(
    id: number,
  ): Promise<AuthenticatedUser | null> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      return null;
    }
    return { id: user.id, email: user.email, role: user.role };
  }
}

/** Emails are treated case-insensitively; the seed stores them normalized too. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
