import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration, { validationSchema } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { GenericsModule } from './modules/generics/generics.module';
import { ImportModule } from './modules/import/import.module';
import { ManufacturersModule } from './modules/manufacturers/manufacturers.module';
import { ProductVariantsModule } from './modules/product-variants/product-variants.module';
import { ProductsModule } from './modules/products/products.module';
import { SalesModule } from './modules/sales/sales.module';
import { StockModule } from './modules/stock/stock.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      // Report every bad/missing variable at once rather than one per restart.
      validationOptions: { abortEarly: false },
    }),
    DatabaseModule,
    AuthModule,
    ManufacturersModule,
    GenericsModule,
    ProductsModule,
    ProductVariantsModule,
    ImportModule,
    StockModule,
    SalesModule,
    DashboardModule,
  ],
})
export class AppModule {}
