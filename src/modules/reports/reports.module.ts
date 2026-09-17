import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Read-only, raw-SQL reporting over sales, returns, payments and batches. */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
