import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiPaginatedResponse,
  PaginatedDto,
} from '../../common/dto/paginated.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import { ListGenericsQueryDto } from './dto/list-generics-query.dto';
import { Generic } from './entities/generic.entity';
import { GenericsService } from './generics.service';

@ApiTags('generics')
@Controller('generics')
export class GenericsController {
  constructor(private readonly genericsService: GenericsService) {}

  @Get()
  @ApiOperation({
    summary: 'List or search generics',
    description: 'Reference data for filter dropdowns. Public.',
  })
  @ApiPaginatedResponse(Generic, 'Generics ordered by name.')
  findAll(
    @Query() query: ListGenericsQueryDto,
  ): Promise<PaginatedDto<Generic>> {
    return this.genericsService.findAll(query);
  }

  @Get(':id/variants')
  @ApiOperation({
    summary: 'List every brand variant sharing this generic',
    description: 'Alternative-brand lookup for a given active ingredient.',
  })
  @ApiPaginatedResponse(ProductVariant, 'Variants built on this generic.')
  @ApiNotFoundResponse({ description: 'No generic with that id.' })
  findVariants(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedDto<ProductVariant>> {
    return this.genericsService.findVariants(id, query);
  }
}
