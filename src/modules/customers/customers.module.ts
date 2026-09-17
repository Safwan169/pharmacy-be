import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesModule } from '../sales/sales.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { Customer, DuePayment } from './entities/customer.entity';

/**
 * Customers exist for one reason: "due" sales. Sales reaches their balance
 * through the plain `adjustCustomerBalance` helper, so only this direction
 * (customers → sales, for the receipt renderer) is a module import.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Customer, DuePayment]), SalesModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
