import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ListVariantsQueryDto } from './dto/list-variants-query.dto';
import { UpdatePricingDto } from './dto/update-pricing.dto';
import { ProductVariant } from './entities/product-variant.entity';
import { ProductVariantsService } from './product-variants.service';

@ApiTags('variants')
@Controller('variants')
export class ProductVariantsController {
  constructor(private readonly variantsService: ProductVariantsService) {}

  @Get()
  @ApiOperation({
    summary: 'Search and filter sellable variants (SKUs)',
    description:
      'The main admin screen. Use `pricing_status=missing` to pull the "needs pricing" ' +
      'worklist of variants that still have no price.',
  })
  @ApiPaginatedResponse(
    ProductVariant,
    'Variants with parent product, manufacturer and generic joined in.',
  )
  findAll(
    @Query() query: ListVariantsQueryDto,
  ): Promise<PaginatedDto<ProductVariant>> {
    return this.variantsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one variant with its product, manufacturer and generic',
  })
  @ApiOkResponse({ type: ProductVariant })
  @ApiNotFoundResponse({ description: 'No variant with that id.' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ProductVariant> {
    return this.variantsService.findOne(id);
  }

  @Patch(':id/pricing')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Set a variant’s price and/or stock',
    description:
      'Admin only. Price and stock are independent — send either alone, so a restock ' +
      'need not resend an unchanged price. `price_updated_at` is stamped only when ' +
      'the price is part of the request. A stock quantity of 0 means confirmed out ' +
      'of stock, which is distinct from the null it starts at.',
  })
  @ApiOkResponse({ description: 'Pricing updated.', type: ProductVariant })
  @ApiBadRequestResponse({
    description: 'Empty body, or a negative/over-precise value.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  @ApiNotFoundResponse({ description: 'No variant with that id.' })
  updatePricing(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePricingDto,
  ): Promise<ProductVariant> {
    return this.variantsService.updatePricing(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Withdraw a variant from the catalogue',
    description:
      'Admin only. This is a soft delete: the SKU is hidden from listings and can ' +
      'no longer be sold, but the row survives so past invoices still render. A ' +
      'hard delete is not offered — it would break the `sale_items` foreign key on ' +
      'any SKU that has ever sold. Reversible via the restore endpoint, and ' +
      'idempotent if already withdrawn.',
  })
  @ApiOkResponse({ description: 'Variant withdrawn.', type: ProductVariant })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  @ApiNotFoundResponse({ description: 'No variant with that id.' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<ProductVariant> {
    return this.variantsService.deactivate(id);
  }

  @Post(':id/restore')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Put a withdrawn variant back in the catalogue',
    description:
      'Admin only. Find withdrawn SKUs with `GET /variants?status=inactive`. ' +
      'Price and stock are exactly as they were left.',
  })
  @ApiOkResponse({ description: 'Variant restored.', type: ProductVariant })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  @ApiNotFoundResponse({ description: 'No variant with that id.' })
  restore(@Param('id', ParseIntPipe) id: number): Promise<ProductVariant> {
    return this.variantsService.restore(id);
  }
}
