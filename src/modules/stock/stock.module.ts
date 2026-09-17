import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import { StockBatch } from './entities/stock-batch.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { ExpiryService } from './expiry.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

/**
 * Owns batches and the movement ledger. Exported so sales (checkout) and
 * product-variants (stock adjustment) move stock through the one service that
 * keeps `stock_quantity` equal to the sum of its batches.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([StockBatch, StockMovement, ProductVariant]),
  ],
  controllers: [StockController],
  providers: [StockService, ExpiryService],
  exports: [StockService],
})
export class StockModule {}
