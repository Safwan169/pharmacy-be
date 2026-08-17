import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiPaginatedResponse,
  PaginatedDto,
} from '../../common/dto/paginated.dto';
import { ListManufacturersQueryDto } from './dto/list-manufacturers-query.dto';
import { Manufacturer } from './entities/manufacturer.entity';
import { ManufacturersService } from './manufacturers.service';

@ApiTags('manufacturers')
@Controller('manufacturers')
export class ManufacturersController {
  constructor(private readonly manufacturersService: ManufacturersService) {}

  @Get()
  @ApiOperation({
    summary: 'List or search manufacturers',
    description: 'Reference data for filter dropdowns. Public.',
  })
  @ApiPaginatedResponse(Manufacturer, 'Manufacturers ordered by name.')
  findAll(
    @Query() query: ListManufacturersQueryDto,
  ): Promise<PaginatedDto<Manufacturer>> {
    return this.manufacturersService.findAll(query);
  }
}
