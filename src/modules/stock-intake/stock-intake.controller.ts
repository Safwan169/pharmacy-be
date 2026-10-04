import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { StockIntakeDto, StockIntakeResultDto } from './dto/stock-intake.dto';
import { StockIntakeService } from './stock-intake.service';

@ApiTags('stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stock')
export class StockIntakeController {
  constructor(private readonly intakeService: StockIntakeService) {}

  @Post('intake')
  @Roles('owner')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Take a whole stock sheet in at once',
    description:
      'For the list a shop already keeps: a name, a count and a selling rate ' +
      'per medicine, nothing else. Each name is matched to the catalogue, ' +
      'anything listed twice is added together, anything the catalogue has ' +
      'never heard of is created, and the lot goes in as one delivery.\n\n' +
      'Send `dry_run: true` first. It reports exactly what it would do and ' +
      'writes nothing, so the real call is the same request with the flag off.\n\n' +
      'A name that fits two medicines is never guessed at: that line comes ' +
      'back as `ambiguous` with the options and is left out.\n\n' +
      'Give `reference` a name for the sheet. Sending the same one twice is ' +
      'refused rather than doubling every count on it.\n\n' +
      '`cost` is optional per line. Without it the batch carries no cost, and ' +
      'the profit and stock-value reports say how much they could not cost ' +
      'instead of treating it as free.',
  })
  @ApiOkResponse({ type: StockIntakeResultDto })
  @ApiBadRequestResponse({
    description:
      'A count or rate that is not a number, or a new medicine with no ' +
      'default_manufacturer to file it under.',
  })
  @ApiConflictResponse({
    description: 'That reference has already been taken in.',
  })
  @ApiUnauthorizedResponse()
  intake(
    @Body() dto: StockIntakeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StockIntakeResultDto> {
    return this.intakeService.intake(dto, user.id);
  }
}
