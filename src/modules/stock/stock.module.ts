import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import { StockBatch } from './entities/stock-batch.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { StockReceipt, StockReceiptItem } from './entities/stock-receipt.entity';
import { ReceiptsService } from './receipts.service';
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
    TypeOrmModule.forFeature([
      StockBatch,
      StockMovement,
      StockReceipt,
      StockReceiptItem,
      ProductVariant,
    ]),
    PricingModule,
  ],
  controllers: [StockController],
  providers: [StockService, ExpiryService, ReceiptsService],
  exports: [StockService],
})
export class StockModule {}
