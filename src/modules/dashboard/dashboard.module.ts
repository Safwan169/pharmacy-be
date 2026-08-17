import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Read-only reporting over data the catalogue and sales modules already own.
 * It adds no entities of its own — the sales aggregate runs as raw SQL through
 * the shared DataSource, so only the variant repository is registered here.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ProductVariant])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
