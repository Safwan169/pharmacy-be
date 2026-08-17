import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiPaginatedResponse,
  PaginatedDto,
} from '../../common/dto/paginated.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { Product } from './entities/product.entity';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({
    summary: 'Search and browse parent products (brand lines)',
    description:
      'Each row carries `variantCount`, the number of SKUs under it.',
  })
  @ApiPaginatedResponse(Product, 'Products ordered by brand name.')
  findAll(
    @Query() query: ListProductsQueryDto,
  ): Promise<PaginatedDto<Product>> {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one product with all its variants nested' })
  @ApiOkResponse({ type: Product })
  @ApiNotFoundResponse({ description: 'No product with that id.' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Product> {
    return this.productsService.findOne(id);
  }
}
