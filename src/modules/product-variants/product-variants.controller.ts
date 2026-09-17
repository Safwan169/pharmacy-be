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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ApiPaginatedResponse,
  PaginatedDto,
} from '../../common/dto/paginated.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ListVariantsQueryDto } from './dto/list-variants-query.dto';
import { UnitTemplatesQueryDto } from './dto/unit-templates-query.dto';
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

  @Get('unit-templates')
  @ApiOperation({
    summary: 'Suggested sellable-unit ladder for a dosage form',
    description:
      'Tablets/capsules propose tablet -> strip -> box; injections vial -> pack; ' +
      'liquids and topicals a single container. Prices are left blank.',
  })
  @ApiQuery({ name: 'dosage_form', required: false, example: 'Tablet' })
  @ApiQuery({ name: 'pack_size', required: false, example: 30 })
  unitTemplates(@Query() query: UnitTemplatesQueryDto) {
    return this.variantsService.unitTemplates(
      query.dosage_form,
      query.pack_size,
    );
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
    summary: 'Set a variant’s sellable units, price and/or stock',
    description:
      'Admin only. `units` replaces the whole ladder (tablet / strip / box with ' +
      'their own prices); `price` alone prices just the base unit; `stock_quantity` ' +
      'is the count in the base unit. Any field can be sent alone. ' +
      '`price_updated_at` is stamped only when a price is part of the request. ' +
      'A stock quantity of 0 means confirmed out of stock, distinct from null.',
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
