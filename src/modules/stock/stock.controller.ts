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
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  ApiPaginatedResponse,
  PaginatedDto,
} from '../../common/dto/paginated.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  ExpiringItemDto,
  ExpiringQueryDto,
  WriteOffDto,
} from './dto/expiring-item.dto';
import {
  CreateReceiptDto,
  ListMovementsQueryDto,
  ListReceiptsQueryDto,
} from './dto/receipt.dto';
import { StockBatch } from './entities/stock-batch.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { StockReceipt } from './entities/stock-receipt.entity';
import { ExpiryService } from './expiry.service';
import { ReceiptsService } from './receipts.service';
import { StockService } from './stock.service';

@ApiTags('stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stock')
export class StockController {
  constructor(
    private readonly stockService: StockService,
    private readonly expiryService: ExpiryService,
    private readonly receiptsService: ReceiptsService,
  ) {}

  @Post('receipts')
  @ApiOperation({
    summary: 'Receive a delivery',
    description:
      'Every line creates a batch with its batch number, expiry date and ' +
      'cost per base unit, adds to stock and writes a stock_in movement. ' +
      'All or nothing: one bad line rejects the whole receipt.',
  })
  @ApiCreatedResponse({ type: StockReceipt })
  @ApiUnprocessableEntityResponse({
    description: 'A line names an unknown or withdrawn medicine, a wrong unit, or a past expiry date.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  createReceipt(
    @Body() dto: CreateReceiptDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StockReceipt> {
    return this.receiptsService.create(dto, user.id);
  }

  @Get('receipts')
  @ApiOperation({ summary: 'List past deliveries' })
  @ApiPaginatedResponse(StockReceipt, 'Receipts, newest first.')
  listReceipts(
    @Query() query: ListReceiptsQueryDto,
  ): Promise<PaginatedDto<StockReceipt>> {
    return this.receiptsService.findAll(query);
  }

  @Get('receipts/:id')
  @ApiOperation({ summary: 'One delivery with its lines' })
  @ApiOkResponse({ type: StockReceipt })
  @ApiNotFoundResponse({ description: 'No receipt with that id.' })
  getReceipt(@Param('id', ParseIntPipe) id: number): Promise<StockReceipt> {
    return this.receiptsService.findOne(id);
  }

  @Get('movements')
  @ApiOperation({
    summary: 'The stock ledger',
    description: 'Every change to stock, newest first. Filter by medicine, type or date.',
  })
  @ApiPaginatedResponse(StockMovement, 'Movements, newest first.')
  listMovements(
    @Query() query: ListMovementsQueryDto,
  ): Promise<PaginatedDto<StockMovement>> {
    return this.receiptsService.movements(query);
  }

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
