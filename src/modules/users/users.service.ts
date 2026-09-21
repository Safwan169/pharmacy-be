import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { BCRYPT_SALT_ROUNDS, normalizeEmail } from '../auth/auth.service';
import { User } from '../auth/entities/user.entity';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
  UserDto,
} from './dto/user.dto';

/** Owner-only management of who can log in. Never returns password hashes. */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(): Promise<UserDto[]> {
    const users = await this.usersRepository.find({
      order: { role: 'ASC', name: 'ASC', email: 'ASC' },
    });
    return users.map(toDto);
  }

  async create(dto: CreateUserDto, actingUserId: number | null = null): Promise<UserDto> {
    const email = normalizeEmail(dto.email);
    const clash = await this.usersRepository.findOne({ where: { email } });
    if (clash) {
      throw new ConflictException({
        message: 'Someone already logs in with that email.',
        reason: 'email_taken',
      });
    }
    const user = await this.usersRepository.save(
      this.usersRepository.create({
        email,
        name: dto.name.trim(),
        role: dto.role,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS),
        isActive: true,
      }),
    );
    await this.auditService.record({
      userId: actingUserId,
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      summary: `Added ${user.name || user.email} as ${user.role}`,
    });
    return toDto(user);
  }

  async update(
    id: number,
    dto: UpdateUserDto,
    actingUserId: number,
  ): Promise<UserDto> {
    const user = await this.findEntity(id);

    const demoting = dto.role !== undefined && dto.role !== 'owner' && user.role === 'owner';
    const deactivating = dto.is_active === false && user.isActive;
    if (id === actingUserId && (demoting || deactivating)) {
      throw new ConflictException({
        message: "You can't lock yourself out. Ask another owner to do this.",
        reason: 'self_lockout',
      });
    }
    if ((demoting || deactivating) && user.role === 'owner') {
      const owners = await this.usersRepository.count({
        where: { role: 'owner', isActive: true },
      });
      if (owners <= 1) {
        throw new ConflictException({
          message: 'The shop needs at least one active owner.',
          reason: 'last_owner',
        });
      }
    }

    const changes: string[] = [];
    if (dto.name !== undefined && dto.name.trim() !== user.name) changes.push(`name → ${dto.name.trim()}`);
    if (dto.role !== undefined && dto.role !== user.role) changes.push(`role ${user.role} → ${dto.role}`);
    if (dto.is_active !== undefined && dto.is_active !== user.isActive) {
      changes.push(dto.is_active ? 'reactivated' : 'deactivated');
    }
    if (dto.name !== undefined) user.name = dto.name.trim();
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.is_active !== undefined) user.isActive = dto.is_active;
    const saved = await this.usersRepository.save(user);
    if (changes.length > 0) {
      await this.auditService.record({
        userId: actingUserId,
        action: 'user.update',
        entityType: 'user',
        entityId: id,
        summary: `${saved.name || saved.email}: ${changes.join(', ')}`,
      });
    }
    return toDto(saved);
  }

  async resetPassword(id: number, dto: ResetPasswordDto, actingUserId: number | null = null): Promise<void> {
    const user = await this.findEntity(id);
    user.passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    await this.usersRepository.save(user);
    await this.auditService.record({
      userId: actingUserId,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: id,
      summary: `Password reset for user #${id}`,
    });
  }

  private async findEntity(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }
}

function toDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    is_active: user.isActive,
    created_at: user.createdAt,
  };
}
