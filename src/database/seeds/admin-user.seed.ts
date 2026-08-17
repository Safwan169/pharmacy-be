import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AppModule } from '../../app.module';
import { normalizeEmail } from '../../modules/auth/auth.service';
import { User } from '../../modules/auth/entities/user.entity';

const BCRYPT_SALT_ROUNDS = 12;

/**
 * Creates the single admin account from ADMIN_EMAIL / ADMIN_PASSWORD.
 * This is the only way a row ever enters `users` — the API has no registration.
 * Idempotent: re-running it on an existing email is a no-op.
 */
async function seedAdminUser(): Promise<void> {
  const logger = new Logger('AdminUserSeed');
  // Booting the full AppModule (rather than a standalone DataSource) reuses the
  // app's own DB config and entity registrations, so the two can't drift.
  const appContext = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const configService = appContext.get(ConfigService);
    const usersRepository = appContext.get<Repository<User>>(
      getRepositoryToken(User),
    );

    const email = normalizeEmail(
      configService.getOrThrow<string>('admin.email'),
    );
    const password = configService.getOrThrow<string>('admin.password');

    const existing = await usersRepository.findOne({ where: { email } });
    if (existing) {
      logger.log(`Admin user "${email}" already exists — nothing to do.`);
      return;
    }

    const user = usersRepository.create({
      email,
      passwordHash: await bcrypt.hash(password, BCRYPT_SALT_ROUNDS),
      role: 'admin',
    });
    await usersRepository.save(user);

    logger.log(`Created admin user "${email}".`);
  } finally {
    await appContext.close();
  }
}

seedAdminUser().catch((error: unknown) => {
  new Logger('AdminUserSeed').error(error);
  process.exitCode = 1;
});
