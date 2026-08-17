import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryDto } from './dto/dashboard-summary.dto';
import { LowStockItemDto } from './dto/low-stock-item.dto';
import { SummaryQueryDto } from './dto/summary-query.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('low-stock')
  @ApiOperation({
    summary: 'List every variant that needs restocking',
    description:
      'Read-only and computed live from current stock, so it is safe to poll — ' +
      'the dashboard widget refreshes on an interval. The badge count is the ' +
      'length of the array. The threshold is set by LOW_STOCK_THRESHOLD.',
  })
  @ApiOkResponse({
    description: 'Low-stock variants, lowest stock first.',
    type: LowStockItemDto,
    isArray: true,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  lowStock(): Promise<LowStockItemDto[]> {
    return this.dashboardService.lowStock();
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Sales totals for a period',
    description:
      'Earnings and volume for a preset window (`period`) or an explicit ' +
      '`from`/`to` range, which wins when both are sent. Dates are the ' +
      'pharmacy’s local calendar dates, and `to` counts in full.',
  })
  @ApiOkResponse({
    description: 'Totals for the resolved window.',
    type: DashboardSummaryDto,
  })
  @ApiBadRequestResponse({
    description:
      'Malformed date, only one half of the range sent, or `from` after `to`.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  summary(@Query() query: SummaryQueryDto): Promise<DashboardSummaryDto> {
    return this.dashboardService.summary(query);
  }
}
