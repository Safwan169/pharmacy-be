import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { fromMinorUnits, toMinorUnits } from '../../common/money';
import { Customer } from './entities/customer.entity';

/**
 * Moves a customer's due balance inside the caller's transaction. Positive
 * adds to the debt (a due sale), negative reduces it (void, return, payment).
 * A plain function rather than a service so sales can use it without a
 * circular module import. Never goes below zero.
 */
export async function adjustCustomerBalance(
  manager: EntityManager,
  customerId: number,
  deltaMinor: number,
): Promise<void> {
  const customer = await manager.findOne(Customer, {
    where: { id: customerId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);
  const next = Math.max(0, toMinorUnits(customer.dueBalance) + deltaMinor);
  await manager.update(Customer, { id: customerId }, { dueBalance: fromMinorUnits(next) });
}
