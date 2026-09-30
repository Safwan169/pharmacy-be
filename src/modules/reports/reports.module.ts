import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DayClosing } from './entities/day-closing.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Raw-SQL reporting over sales, returns, payments and batches. Read-only but
 * for one thing: the night's count of the cash drawer, which is what the next
 * day's opening balance is built from.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DayClosing])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
