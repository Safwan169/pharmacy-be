import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductVariantsModule } from '../product-variants/product-variants.module';
import { Generic } from './entities/generic.entity';
import { GenericsController } from './generics.controller';
import { GenericsService } from './generics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Generic]), ProductVariantsModule],
  controllers: [GenericsController],
  providers: [GenericsService],
  exports: [GenericsService],
})
export class GenericsModule {}
