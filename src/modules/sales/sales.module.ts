import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import { PricingModule } from '../pricing/pricing.module';
import { StockModule } from '../stock/stock.module';
import { InvoiceSequence } from './entities/invoice-sequence.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SaleReturn, SaleReturnItem } from './entities/sale-return.entity';
import { Sale } from './entities/sale.entity';
import { InvoicePdfService } from './invoice-pdf.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { SalesController } from './sales.controller';
import { ReturnsService } from './returns.service';
import { SalesService } from './sales.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      SaleItem,
      SaleReturn,
      SaleReturnItem,
      InvoiceSequence,
      ProductVariant,
    ]),
    StockModule,
    PricingModule,
  ],
  controllers: [SalesController],
  providers: [SalesService, InvoicePdfService, ReceiptPdfService, ReturnsService],
  exports: [SalesService, ReceiptPdfService],
})
export class SalesModule {}
