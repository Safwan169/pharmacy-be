import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiPaginatedResponse,
  PaginatedDto,
} from '../../common/dto/paginated.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ReceiptPdfService } from '../sales/receipt-pdf.service';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  CreateDuePaymentDto,
  DueCustomerDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from './dto/customer.dto';
import { Customer, DuePayment } from './entities/customer.entity';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly receiptPdfService: ReceiptPdfService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List or search customers' })
  @ApiPaginatedResponse(Customer, 'Customers by name.')
  findAll(@Query() query: ListCustomersQueryDto): Promise<PaginatedDto<Customer>> {
    return this.customersService.findAll(query);
  }

  @Get('due')
  @ApiOperation({ summary: 'Everyone who owes money, longest outstanding first' })
  @ApiOkResponse({ type: DueCustomerDto, isArray: true })
  dueList(): Promise<DueCustomerDto[]> {
    return this.customersService.dueList();
  }

  @Get('payments/:id/receipt/pdf')
  @ApiOperation({ summary: 'Thermal receipt for a due payment' })
  @ApiProduces('application/pdf')
  @ApiNotFoundResponse({ description: 'No payment with that id.' })
  async paymentReceipt(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const payment = await this.customersService.findPayment(id);
    const pdf = await this.receiptPdfService.renderPayment(payment);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${payment.receiptNumber}.pdf"`,
      'Content-Length': String(pdf.length),
    });
    res.end(pdf);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One customer' })
  @ApiOkResponse({ type: Customer })
  @ApiNotFoundResponse({ description: 'No customer with that id.' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Customer> {
    return this.customersService.findOne(id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Recent sales and payments for a customer' })
  history(@Param('id', ParseIntPipe) id: number) {
    return this.customersService.history(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a customer' })
  @ApiCreatedResponse({ type: Customer })
  @ApiConflictResponse({ description: 'Phone number already belongs to someone.' })
  create(@Body() dto: CreateCustomerDto): Promise<Customer> {
    return this.customersService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a customer' })
  @ApiOkResponse({ type: Customer })
  @ApiNotFoundResponse({ description: 'No customer with that id.' })
  @ApiConflictResponse({ description: '`phone_taken` or `has_due`.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
  ): Promise<Customer> {
    return this.customersService.update(id, dto);
  }

  @Post(':id/payments')
  @ApiOperation({
    summary: 'Receive money against a due balance',
    description: 'Never more than they owe. Settles the oldest open sales first.',
  })
  @ApiCreatedResponse({ type: DuePayment })
  @ApiBadRequestResponse({ description: '`overpayment` or `sale_mismatch`.' })
  @ApiNotFoundResponse({ description: 'No customer with that id.' })
  recordPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateDuePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DuePayment> {
    return this.customersService.recordPayment(id, dto, user.id);
  }
}
