import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductVariant } from './entities/product-variant.entity';
import { ProductVariantsController } from './product-variants.controller';
import { ProductVariantsService } from './product-variants.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductVariant])],
  controllers: [ProductVariantsController],
  providers: [ProductVariantsService],
  // Exported so GenericsModule can reuse the variant listing for its
  // "alternative brands sharing this generic" endpoint.
  exports: [ProductVariantsService],
})
export class ProductVariantsModule {}
