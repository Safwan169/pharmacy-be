import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductVariant } from './entities/product-variant.entity';
import { StockModule } from '../stock/stock.module';
import { VariantUnit } from './entities/variant-unit.entity';
import { ProductVariantsController } from './product-variants.controller';
import { ProductVariantsService } from './product-variants.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductVariant, VariantUnit]), StockModule],
  controllers: [ProductVariantsController],
  providers: [ProductVariantsService],
  // Exported so GenericsModule can reuse the variant listing for its
  // "alternative brands sharing this generic" endpoint.
  exports: [ProductVariantsService],
})
export class ProductVariantsModule {}
