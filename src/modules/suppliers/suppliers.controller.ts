import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ApiPaginatedResponse,
  PaginatedDto,
} from '../../common/dto/paginated.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { SupplierPayment } from './entities/supplier-payment.entity';
import { StockReceipt } from '../stock/entities/stock-receipt.entity';
import {
  CreateSupplierPaymentDto,
  DueSupplierDto,
  CreateSupplierDto,
  ListSuppliersQueryDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { Supplier } from './entities/supplier.entity';
import { SuppliersService } from './suppliers.service';

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('owner')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @ApiOperation({ summary: 'List or search suppliers' })
  @ApiPaginatedResponse(Supplier, 'Suppliers ordered by name.')
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  findAll(@Query() query: ListSuppliersQueryDto): Promise<PaginatedDto<Supplier>> {
    return this.suppliersService.findAll(query);
  }

  @Get('due')
  @ApiOperation({ summary: 'Suppliers the shop still owes, oldest debt first' })
  @ApiOkResponse({ type: DueSupplierDto, isArray: true })
  dueList(): Promise<DueSupplierDto[]> {
    return this.suppliersService.dueList();
  }

  @Get(':id/history')
  @ApiOperation({ summary: "A supplier's deliveries (with paid/due) and payments" })
  history(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ receipts: StockReceipt[]; payments: SupplierPayment[] }> {
    return this.suppliersService.history(id);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Pay a supplier against the balance owed' })
  @ApiCreatedResponse({ type: SupplierPayment })
  recordPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSupplierPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SupplierPayment> {
    return this.suppliersService.recordPayment(id, dto, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one supplier' })
  @ApiOkResponse({ type: Supplier })
  @ApiNotFoundResponse({ description: 'No supplier with that id.' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Supplier> {
    return this.suppliersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a supplier' })
  @ApiCreatedResponse({ type: Supplier })
  @ApiConflictResponse({ description: 'A supplier with that name exists.' })
  create(@Body() dto: CreateSupplierDto): Promise<Supplier> {
    return this.suppliersService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a supplier, or deactivate it' })
  @ApiOkResponse({ type: Supplier })
  @ApiNotFoundResponse({ description: 'No supplier with that id.' })
  @ApiConflictResponse({ description: 'A supplier with that name exists.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
  ): Promise<Supplier> {
    return this.suppliersService.update(id, dto);
  }
}
