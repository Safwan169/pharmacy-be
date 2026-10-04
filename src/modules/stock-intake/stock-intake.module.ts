import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductVariantsModule } from '../product-variants/product-variants.module';
import { StockModule } from '../stock/stock.module';
import { StockReceipt } from '../stock/entities/stock-receipt.entity';
import { StockIntakeController } from './stock-intake.controller';
import { StockIntakeService } from './stock-intake.service';

/**
 * Its own module rather than a method on StockModule, because taking a sheet
 * in needs both the catalogue (to find a name, or invent one) and deliveries
 * (to land the stock), and product-variants already imports stock — putting
 * this in either one would close the loop.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([StockReceipt]),
    StockModule,
    ProductVariantsModule,
  ],
  controllers: [StockIntakeController],
  providers: [StockIntakeService],
})
export class StockIntakeModule {}
