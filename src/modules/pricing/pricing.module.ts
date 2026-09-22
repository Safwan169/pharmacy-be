import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VariantPendingPrice } from './entities/variant-pending-price.entity';
import { PendingPriceController } from './pending-price.controller';
import { PendingPriceService } from './pending-price.service';

/**
 * Selling-price changes that ride along with deliveries. Kept out of
 * ProductVariantsModule and StockModule so both (and SalesModule) can use it
 * without a cycle.
 */
@Module({
  imports: [TypeOrmModule.forFeature([VariantPendingPrice])],
  controllers: [PendingPriceController],
  providers: [PendingPriceService],
  exports: [PendingPriceService],
})
export class PricingModule {}
