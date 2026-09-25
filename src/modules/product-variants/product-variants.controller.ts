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
  ApiConflictResponse,
  ApiCreatedResponse,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ListVariantsQueryDto } from './dto/list-variants-query.dto';
import { UnitTemplatesQueryDto } from './dto/unit-templates-query.dto';
import { UpdatePricingDto } from './dto/update-pricing.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { BulkPriceDto, BulkPricePreviewDto } from './dto/bulk-price.dto';
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

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add a medicine by hand',
    description:
      'For items the imported catalogue lacks. Company, ingredient and brand ' +
      'line are reused when they already exist. The new SKU has no units, ' +
      'price or stock yet — set those with PATCH /variants/:id/pricing.',
  })
  @ApiCreatedResponse({ type: ProductVariant })
  @ApiConflictResponse({
    description: 'That brand, strength and form already exists (reason: variant_exists).',
  })
  @ApiUnauthorizedResponse()
  create(@Body() dto: CreateVariantDto): Promise<ProductVariant> {
    return this.variantsService.create(dto);
  }

  @Post('bulk-price')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change many prices at once (preview by default)',
    description:
      'Filters to a company, ingredient or search term, then moves every ' +
      'priced unit by a percentage or a fixed amount. dry_run (default true) ' +
      'only reports what would change.',
  })
  @ApiOkResponse({ type: BulkPricePreviewDto })
  bulkPrice(
    @Body() dto: BulkPriceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BulkPricePreviewDto> {
    return this.variantsService.bulkPrice(dto, user.id);
  }

  @Get('favourites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Most-sold medicines, for the counter’s quick-pick tiles',
    description: 'Priced, active SKUs ordered by units sold in the last `days` days.',
  })
  @ApiQuery({ name: 'limit', required: false, example: 18 })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiOkResponse({ type: ProductVariant, isArray: true })
  favourites(
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 18,
    @Query('days', new ParseIntPipe({ optional: true })) days = 30,
  ): Promise<ProductVariant[]> {
    return this.variantsService.favourites(Math.min(Math.max(limit, 1), 40), Math.min(Math.max(days, 1), 365));
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
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
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductVariant> {
    return this.variantsService.updatePricing(id, dto, user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
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
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductVariant> {
    return this.variantsService.deactivate(id, user.id);
  }

  @Post(':id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
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
  restore(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductVariant> {
    return this.variantsService.restore(id, user.id);
  }
}
