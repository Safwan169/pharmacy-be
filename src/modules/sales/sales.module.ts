import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import { StockModule } from '../stock/stock.module';
import { InvoiceSequence } from './entities/invoice-sequence.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Sale } from './entities/sale.entity';
import { InvoicePdfService } from './invoice-pdf.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleItem, InvoiceSequence, ProductVariant]),
    StockModule,
  ],
  controllers: [SalesController],
  providers: [SalesService, InvoicePdfService],
  exports: [SalesService],
})
export class SalesModule {}
