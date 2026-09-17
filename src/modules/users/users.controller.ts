import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
  UserDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('owner')
@ApiForbiddenResponse({ description: 'Owner only.' })
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Everyone who can log in' })
  @ApiOkResponse({ type: UserDto, isArray: true })
  findAll(): Promise<UserDto[]> {
    return this.usersService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Add a user (owner or cashier)' })
  @ApiCreatedResponse({ type: UserDto })
  @ApiConflictResponse({ description: 'Email already in use.' })
  create(@Body() dto: CreateUserDto): Promise<UserDto> {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Rename, change role, or deactivate',
    description:
      'A deactivated user cannot log in and their current token stops working. ' +
      'The last active owner cannot be demoted or deactivated.',
  })
  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse({ description: 'No user with that id.' })
  @ApiConflictResponse({ description: '`self_lockout` or `last_owner`.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserDto> {
    return this.usersService.update(id, dto, user.id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Set a user's password for them" })
  @ApiNotFoundResponse({ description: 'No user with that id.' })
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    await this.usersService.resetPassword(id, dto);
  }
}
