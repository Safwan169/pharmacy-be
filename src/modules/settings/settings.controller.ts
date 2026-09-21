import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SettingsDto, UpdateSettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Shop name, address, licence, receipt text and thresholds' })
  @ApiOkResponse({ type: SettingsDto })
  getAll(): Promise<SettingsDto> {
    return this.settingsService.getAll();
  }

  @Patch()
  @Roles('owner')
  @ApiOperation({ summary: 'Update any of the settings (owner)' })
  @ApiOkResponse({ type: SettingsDto })
  @ApiForbiddenResponse({ description: 'Owner only.' })
  update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: AuthenticatedUser): Promise<SettingsDto> {
    return this.settingsService.update(dto, user.id);
  }
}
