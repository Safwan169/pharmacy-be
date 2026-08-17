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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CheckoutRejectedDto } from './dto/checkout-failure.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { ListSalesQueryDto } from './dto/list-sales-query.dto';
import { Sale } from './entities/sale.entity';
import { InvoicePdfService } from './invoice-pdf.service';
import { SalesService } from './sales.service';

@ApiTags('sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

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
  findAll(@Query() query: ListSalesQueryDto): Promise<PaginatedDto<Sale>> {
    return this.salesService.findAll(query);
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
