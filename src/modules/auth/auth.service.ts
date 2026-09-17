import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
  role: string;
}

export const BCRYPT_SALT_ROUNDS = 12;

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
    if (!user.isActive) {
      throw new UnauthorizedException({
        message: 'This account has been deactivated.',
        reason: 'inactive_user',
      });
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return { access_token: await this.jwtService.signAsync(payload) };
  }

  /** Self-service password change; needs the current password. */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new BadRequestException({
        message: 'The current password is wrong.',
        reason: 'wrong_password',
      });
    }
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await this.usersRepository.save(user);
  }

  /** Resolves the token subject against the database on every request, so a
   * deleted user's still-unexpired token stops working immediately. */
  async findAuthenticatedUserById(
    id: number,
  ): Promise<AuthenticatedUser | null> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user || !user.isActive) {
      return null;
    }
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}

/** Emails are treated case-insensitively; the seed stores them normalized too. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
