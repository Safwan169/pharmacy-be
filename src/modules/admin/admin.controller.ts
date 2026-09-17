import {
  Controller,
  Get,
  InternalServerErrorException,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  BackupFile,
  listBackups,
  optionsFromEnv,
  runBackup,
} from '../../database/backup';

/** Owner-only housekeeping. Backups run pg_dump on the API host. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('owner')
@ApiForbiddenResponse({ description: 'Owner only.' })
@Controller('admin')
export class AdminController {
  @Get('backups')
  @ApiOperation({ summary: 'Backup files on disk, newest first' })
  @ApiOkResponse({ description: 'name, size_bytes, created_at' })
  list(): { dir: string; files: BackupFile[] } {
    const options = optionsFromEnv();
    return { dir: options.dir, files: listBackups(options.dir) };
  }

  @Post('backup')
  @ApiOperation({
    summary: 'Take a backup now',
    description: 'Runs pg_dump into BACKUP_DIR and prunes dumps older than BACKUP_KEEP_DAYS.',
  })
  @ApiCreatedResponse({ description: 'The new file.' })
  async backup(): Promise<BackupFile> {
    try {
      return await runBackup(optionsFromEnv());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException({
        message: /ENOENT|not found|not recognized/i.test(message)
          ? 'pg_dump was not found on this computer. Install PostgreSQL client tools or set PG_DUMP_PATH.'
          : `Backup failed: ${message}`,
        reason: 'backup_failed',
      });
    }
  }
}
