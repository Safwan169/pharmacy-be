import { Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { VariantPendingPrice } from './entities/variant-pending-price.entity';
import { PendingPriceService } from './pending-price.service';

@ApiTags('variants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('variants/:id/pending-price')
export class PendingPriceController {
  constructor(private readonly pendingPrices: PendingPriceService) {}

  @Get()
  @Roles('owner', 'cashier')
  @ApiOperation({ summary: 'The price change waiting for old stock to sell out, if any' })
  @ApiOkResponse({ type: VariantPendingPrice })
  get(@Param('id', ParseIntPipe) id: number): Promise<VariantPendingPrice | null> {
    return this.pendingPrices.forVariant(id);
  }

  @Post('apply')
  @Roles('owner')
  @ApiOperation({ summary: 'Apply the waiting price now instead of waiting' })
  @ApiNotFoundResponse({ description: 'Nothing pending.' })
  apply(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.pendingPrices.applyPendingNow(id, user.id);
  }

  @Delete()
  @Roles('owner')
  @ApiOperation({ summary: 'Drop the waiting price change' })
  @ApiNotFoundResponse({ description: 'Nothing pending.' })
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.pendingPrices.cancel(id, user.id);
  }
}
