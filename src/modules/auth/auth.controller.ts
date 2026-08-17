import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
// `import type` is required: it appears in a decorated signature under
// isolatedModules + emitDecoratorMetadata.
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { UserProfileDto } from './dto/user-profile.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in as the admin user',
    description:
      'Exchanges email + password for a JWT. The admin account is created by the ' +
      '`seed:admin` script — there is no registration endpoint.',
  })
  @ApiOkResponse({
    description: 'Credentials accepted; access token issued.',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unknown email or wrong password (not distinguished).',
  })
  login(@Body() loginDto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(loginDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get the currently authenticated user',
    description:
      'Returns the token holder’s details. Useful for verifying a token.',
  })
  @ApiOkResponse({
    description: 'The authenticated user, without the password hash.',
    type: UserProfileDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, malformed, or expired token.',
  })
  me(@CurrentUser() user: AuthenticatedUser): UserProfileDto {
    return { id: user.id, email: user.email, role: user.role };
  }
}
