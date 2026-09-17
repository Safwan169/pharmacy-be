import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ApiPaginatedResponse,
  PaginatedDto,
} from '../../common/dto/paginated.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CheckoutRejectedDto } from './dto/checkout-failure.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { ListSalesQueryDto } from './dto/list-sales-query.dto';
import { CreateReturnDto, VoidSaleDto } from './dto/return.dto';
import { SaleReturn } from './entities/sale-return.entity';
import { Sale } from './entities/sale.entity';
import { InvoicePdfService } from './invoice-pdf.service';
import { ReturnsService } from './returns.service';
import { SalesService } from './sales.service';

@ApiTags('sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly invoicePdfService: InvoicePdfService,
    private readonly returnsService: ReturnsService,
  ) {}

  @Post(':id/void')
  @Roles('owner')
  @ApiOperation({
    summary: 'Void a sale made today',
    description:
      'Reverses the whole sale: every unit goes back into the batch it came ' +
      'from and the sale is marked voided (the invoice number is kept). Only ' +
      'allowed on the day of sale and before any return.',
  })
  @ApiOkResponse({ type: Sale })
  @ApiConflictResponse({
    description: '`void_window_closed` (not today) or `not_voidable` (already voided/returned).',
  })
  @ApiNotFoundResponse({ description: 'No sale with that id.' })
  async voidSale(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VoidSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Sale> {
    await this.returnsService.voidSale(id, dto, user.id);
    return this.salesService.findOne(id);
  }

  @Post(':id/returns')
  @ApiOperation({
    summary: 'Take items back from a sale',
    description:
      'Refunds each returned unit at its price less its share of the sale ' +
      'discount, and restocks it into the original batch unless `restock` is false.',
  })
  @ApiCreatedResponse({ type: Sale })
  @ApiUnprocessableEntityResponse({
    description: 'A line is not on this sale, or asks for more than is left to return.',
  })
  @ApiConflictResponse({ description: 'The sale is voided or fully returned.' })
  @ApiNotFoundResponse({ description: 'No sale with that id.' })
  async createReturn(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateReturnDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Sale> {
    await this.returnsService.createReturn(id, dto, user.id);
    return this.salesService.findOne(id);
  }

  @Get(':id/returns')
  @ApiOperation({ summary: 'Returns recorded against a sale' })
  @ApiOkResponse({ type: SaleReturn, isArray: true })
  listReturns(@Param('id', ParseIntPipe) id: number): Promise<SaleReturn[]> {
    return this.returnsService.listForSale(id);
  }

  @Post('checkout')
  @ApiOperation({
    summary: 'Check out a basket of items in one request',
    description:
      'Direct POS checkout — there is no cart resource. Validates every line, ' +
      'deducts stock, and records the sale in a single transaction. If any line ' +
      'is unsellable the whole checkout is rejected and no stock moves.',
  })
  @ApiCreatedResponse({ description: 'Sale recorded.', type: Sale })
  @ApiUnprocessableEntityResponse({
    description: 'One or more lines could not be sold. Nothing was saved.',
    type: CheckoutRejectedDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  checkout(
    @Body() dto: CheckoutDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Sale> {
    return this.salesService.checkout(dto, user.id);
  }

  @Get()
  @ApiOperation({
    summary: 'List and search past sales',
    description:
      'Filter by invoice number and/or date range to find a sale and re-download ' +
      'its invoice. Line items are omitted here — fetch a single sale for those.',
  })
  @ApiPaginatedResponse(Sale, 'Sales, newest first.')
  findAll(
    @Query() query: ListSalesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedDto<Sale>> {
    // A cashier sees only what they rang up; the owner sees the whole shop.
    return this.salesService.findAll(
      query,
      user.role === 'owner' ? undefined : user.id,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one sale with its items and discount breakdown',
  })
  @ApiOkResponse({ type: Sale })
  @ApiNotFoundResponse({ description: 'No sale with that id.' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Sale> {
    return this.salesService.findOne(id);
  }

  @Get(':id/invoice/pdf')
  @ApiOperation({ summary: 'Download the invoice as a PDF' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'The invoice PDF.',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiNotFoundResponse({ description: 'No sale with that id.' })
  async downloadInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const sale = await this.salesService.findOne(id);
    const pdf = await this.invoicePdfService.render(sale);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${sale.invoiceNumber}.pdf"`,
      'Content-Length': String(pdf.length),
    });
    res.end(pdf);
  }
}
