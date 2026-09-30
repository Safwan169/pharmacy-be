import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { nextDocumentNumber } from '../../common/document-number';
import { fromMinorUnits, toMinorUnits } from '../../common/money';
import { Sale } from '../sales/entities/sale.entity';
import { Customer, DuePayment } from './entities/customer.entity';

export const PAYMENT_PREFIX = 'PAY';

export interface DuePaymentInput {
  customerId: number;
  /** Taka. Never more than the customer owes. */
  amount: number;
  method: 'cash' | 'bkash';
  bkashTrxId?: string | null;
  note?: string | null;
  /** Settle this sale before the older ones — the bill just rung up. */
  saleId?: number | null;
  userId: number;
}

/**
 * Takes money off what a customer owes, inside the caller's transaction.
 *
 * A plain function rather than a service method because two callers need it
 * and one of them is the counter: paying part of a bill as it is rung up is
 * the same event as paying it off later, and doing it in the checkout's own
 * transaction is what stops a sale existing for a moment with money against
 * it that was never recorded.
 *
 * Paying more than is owed is refused rather than quietly kept as credit —
 * the shop has no notion of a customer being in front.
 */
export async function applyDuePayment(
  manager: EntityManager,
  input: DuePaymentInput,
): Promise<DuePayment> {
  const customer = await manager.findOne(Customer, {
    where: { id: input.customerId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!customer)
    throw new NotFoundException(`Customer ${input.customerId} not found`);

  const owedMinor = toMinorUnits(customer.dueBalance);
  const paidMinor = toMinorUnits(input.amount);
  if (paidMinor > owedMinor) {
    throw new BadRequestException({
      message: `They only owe ${fromMinorUnits(owedMinor).toFixed(2)}. Enter that or less.`,
      reason: 'overpayment',
      due_balance: fromMinorUnits(owedMinor),
    });
  }

  const balanceAfter = fromMinorUnits(owedMinor - paidMinor);
  await manager.update(
    Customer,
    { id: input.customerId },
    { dueBalance: balanceAfter },
  );

  // Settle the oldest open sales first so `due_amount` on each sale stays honest.
  let remaining = paidMinor;
  const open = await manager
    .createQueryBuilder(Sale, 'sale')
    .where('sale.customerId = :customerId', { customerId: input.customerId })
    .andWhere('sale.dueAmount > 0')
    .andWhere("sale.status <> 'voided'")
    .orderBy(
      input.saleId != null
        ? `CASE WHEN sale.id = ${Number(input.saleId)} THEN 0 ELSE 1 END`
        : 'sale.createdAt',
      'ASC',
    )
    .addOrderBy('sale.createdAt', 'ASC')
    .getMany();
  for (const sale of open) {
    if (remaining <= 0) break;
    const saleDueMinor = toMinorUnits(sale.dueAmount);
    const settle = Math.min(saleDueMinor, remaining);
    await manager.update(
      Sale,
      { id: sale.id },
      {
        dueAmount: fromMinorUnits(saleDueMinor - settle),
        paidAmount: fromMinorUnits(toMinorUnits(sale.paidAmount) + settle),
      },
    );
    remaining -= settle;
  }

  return manager.save(
    manager.create(DuePayment, {
      customerId: input.customerId,
      saleId: input.saleId ?? null,
      receiptNumber: await nextDocumentNumber(manager, PAYMENT_PREFIX),
      amount: fromMinorUnits(paidMinor),
      method: input.method,
      bkashTrxId: input.bkashTrxId?.trim() || null,
      note: input.note?.trim() || null,
      balanceAfter,
      createdById: input.userId,
    }),
  );
}
