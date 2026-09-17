import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  ExpiringItemDto,
  ExpiringQueryDto,
  WriteOffDto,
} from './dto/expiring-item.dto';
import { StockBatch } from './entities/stock-batch.entity';
import { ExpiryService } from './expiry.service';
import { StockService } from './stock.service';

@ApiTags('stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stock')
export class StockController {
  constructor(
    private readonly stockService: StockService,
    private readonly expiryService: ExpiryService,
  ) {}

  @Get('expiring')
  @ApiOperation({
    summary: 'Batches expiring within 30, 60 or 90 days',
    description: 'Only batches that still hold stock. Soonest first.',
  })
  @ApiOkResponse({ type: ExpiringItemDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  expiring(@Query() query: ExpiringQueryDto): Promise<ExpiringItemDto[]> {
    return this.expiryService.expiring(query.days ?? 30);
  }

  @Get('expired')
  @ApiOperation({
    summary: 'Batches past their expiry date that still hold stock',
    description:
      'These can no longer be sold — checkout refuses them. Write them off ' +
      'to take them out of the stock count.',
  })
  @ApiOkResponse({ type: ExpiringItemDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  expired(): Promise<ExpiringItemDto[]> {
    return this.expiryService.expired();
  }

  @Post('batches/:id/write-off')
  @ApiOperation({
    summary: 'Write off a batch',
    description:
      'Sets the batch quantity to zero and records an expired_writeoff ' +
      'movement. Idempotent on an already-empty batch.',
  })
  @ApiOkResponse({ type: StockBatch })
  @ApiNotFoundResponse({ description: 'No batch with that id.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  writeOff(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WriteOffDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StockBatch> {
    return this.stockService.writeOff(id, user.id, dto.note);
  }
}
