import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  DailyClosingDto,
  DailyClosingQueryDto,
  ProfitQueryDto,
  ProfitReportDto,
  StockValueDto,
} from './dto/reports.dto';
import { ReportsService, toCsv } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('daily-closing')
  @ApiOperation({
    summary: 'End-of-day figures',
    description:
      'Sales, discounts, refunds, takings by method and the cash that should be ' +
      'in the drawer. A cashier gets today only, for their own sales.',
  })
  @ApiOkResponse({ type: DailyClosingDto })
  async dailyClosing(
    @Query() query: DailyClosingQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DailyClosingDto | string> {
    const isOwner = user.role === 'owner';
    const report = await this.reportsService.dailyClosing(
      isOwner ? query.date : undefined,
      isOwner ? undefined : user.id,
    );
    if (query.format === 'csv') {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="closing-${report.date}.csv"`,
      });
      const rows = [
        { item: 'Sales count', value: report.sales_count },
        { item: 'Gross sales', value: report.gross_sales },
        { item: 'Discounts', value: report.discounts },
        { item: 'Refunds', value: report.refunds },
        { item: 'Net sales', value: report.net_sales },
        { item: 'Cash sales', value: report.by_method.cash },
        { item: 'bKash sales', value: report.by_method.bkash },
        { item: 'Due sales', value: report.by_method.due },
        { item: 'Due collected (cash)', value: report.due_collected.cash },
        { item: 'Due collected (bKash)', value: report.due_collected.bkash },
        { item: 'Cash in drawer expected', value: report.cash_in_drawer_expected },
        { item: 'Voided sales', value: report.voided_count },
      ];
      return toCsv(rows, ['item', 'value']);
    }
    return report;
  }

  @Get('profit')
  @Roles('owner')
  @ApiOperation({ summary: 'Revenue, cost of goods and gross profit by day and by product' })
  @ApiOkResponse({ type: ProfitReportDto })
  @ApiForbiddenResponse({ description: 'Owner only.' })
  async profit(
    @Query() query: ProfitQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProfitReportDto | string> {
    const report = await this.reportsService.profit(query.from, query.to);
    if (query.format === 'csv') {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="profit-${query.from}-${query.to}.csv"`,
      });
      return toCsv(
        report.by_day.map((d) => ({ ...d })),
        ['date', 'revenue', 'cogs', 'gross_profit', 'margin_pct', 'uncosted_lines'],
      );
    }
    return report;
  }

  @Get('stock-value')
  @Roles('owner')
  @ApiOperation({ summary: 'What the stock on the shelf is worth at cost and at price' })
  @ApiOkResponse({ type: StockValueDto })
  @ApiForbiddenResponse({ description: 'Owner only.' })
  stockValue(): Promise<StockValueDto> {
    return this.reportsService.stockValue();
  }
}
