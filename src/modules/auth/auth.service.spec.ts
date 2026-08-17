import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService, JwtPayload } from './auth.service';
import { User } from './entities/user.entity';

// bcrypt's native binding exposes non-configurable properties, so jest.spyOn
// can't wrap it. Mock the module instead, delegating to the real implementation.
jest.mock('bcrypt', () => {
  const actual = jest.requireActual<typeof import('bcrypt')>('bcrypt');
  // Pin the promise-returning overload; the default resolution picks the
  // callback (void) one, which trips no-misused-promises.
  const compare: (data: string, encrypted: string) => Promise<boolean> =
    actual.compare;
  return { ...actual, compare: jest.fn(compare) };
});

const JWT_SECRET = 'test-secret-value-for-unit-tests';
const PASSWORD = 'correct-horse-battery';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let findOne: jest.Mock;
  let adminUser: User;

  beforeAll(async () => {
    adminUser = {
      id: 1,
      email: 'admin@example.com',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    findOne = jest.fn();
    jwtService = new JwtService({
      secret: JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    it('issues a token carrying the user id and email for valid credentials', async () => {
      findOne.mockResolvedValue(adminUser);

      const { access_token } = await service.login({
        email: 'admin@example.com',
        password: PASSWORD,
      });

      const payload = jwtService.verify<JwtPayload>(access_token, {
        secret: JWT_SECRET,
      });
      expect(payload.sub).toBe(adminUser.id);
      expect(payload.email).toBe(adminUser.email);
    });

    it('looks the user up by a lower-cased, trimmed email', async () => {
      findOne.mockResolvedValue(adminUser);

      await service.login({
        email: '  ADMIN@Example.com ',
        password: PASSWORD,
      });

      expect(findOne).toHaveBeenCalledWith({
        where: { email: 'admin@example.com' },
      });
    });

    it('rejects a wrong password', async () => {
      findOne.mockResolvedValue(adminUser);

      await expect(
        service.login({ email: 'admin@example.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown email with the same message as a wrong password', async () => {
      findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: PASSWORD }),
      ).rejects.toThrow('Invalid credentials');

      findOne.mockResolvedValue(adminUser);
      await expect(
        service.login({ email: 'admin@example.com', password: 'wrong' }),
      ).rejects.toThrow('Invalid credentials');
    });

    it('still runs a hash comparison when the email is unknown', async () => {
      // Guards the timing-attack mitigation: an unknown email must not short
      // out before the bcrypt work a wrong password would have cost.
      findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: PASSWORD }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
      // ...and against a real hash, not a short-circuiting empty value.
      const [, hash] = jest.mocked(bcrypt.compare).mock.calls[0];
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    });
  });

  describe('findAuthenticatedUserById', () => {
    it('returns the user without the password hash', async () => {
      findOne.mockResolvedValue(adminUser);

      await expect(service.findAuthenticatedUserById(1)).resolves.toEqual({
        id: 1,
        email: 'admin@example.com',
        role: 'admin',
      });
    });

    it('returns null when the token subject no longer exists', async () => {
      findOne.mockResolvedValue(null);

      await expect(service.findAuthenticatedUserById(99)).resolves.toBeNull();
    });
  });
});
