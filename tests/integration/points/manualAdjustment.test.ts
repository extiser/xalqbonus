import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { adjustPointsManually } from '#server/services/points/adjustPointsManually';
import {
  DriverAccountMissingError,
  InsufficientPointsError,
  InvalidManualAmountError,
  MissingManualNoteError,
} from '#server/services/points/errors';
import {
  cleanupTestData,
  countTransfersByReason,
  createTestPerson,
  disconnectDatabase,
  readAccountBalance,
  readSystemBalance,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { grantPoints } from '../support/points';

describe('ручная правка баллов', () => {
  afterEach(async () => {
    // Переводы уходят вместе с людьми первыми: учётка сотрудника на них ссылается.
    await cleanupTestData();
    await cleanupTestEmployees();
  });
  afterAll(disconnectDatabase);

  it('начисляет с эмиссии и списывает обратно, записывая автора и заметку', async () => {
    const person = await createTestPerson({ inProgram: true });
    await grantPoints(person.personId, 10);
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const emissionBefore = await readSystemBalance('emission');

    const credit = await adjustPointsManually({
      personId: person.personId,
      amount: 5,
      note: '  компенсация за сбой  ',
      employeeId,
    });

    expect(credit.balance).toBe(15n);
    expect(await readSystemBalance('emission')).toBe(emissionBefore - 5n);

    const debit = await adjustPointsManually({
      personId: person.personId,
      amount: -7,
      note: 'списание мимо каталога',
      employeeId,
    });

    expect(debit.balance).toBe(8n);
    expect(await readAccountBalance(person.personId)).toBe(8n);
    expect(await readSystemBalance('emission')).toBe(emissionBefore + 2n);

    const creditTransfer = await db.pointTransfer.findUniqueOrThrow({
      where: { id: credit.transferId },
    });

    expect(creditTransfer.reason).toBe('manual');
    expect(creditTransfer.idempotencyKey).toMatch(/^manual:[0-9a-f-]{36}$/);
    expect(creditTransfer.amount).toBe(5n);
    expect(creditTransfer.actor).toBe('operator');
    expect(creditTransfer.actorEmployeeId).toBe(employeeId);
    expect(creditTransfer.note).toBe('компенсация за сбой');

    const debitTransfer = await db.pointTransfer.findUniqueOrThrow({
      where: { id: debit.transferId },
    });

    // Направление — парой счетов, сумма — модулем: перевод знака не принимает.
    expect(debitTransfer.amount).toBe(7n);
    expect(debitTransfer.toAccountId).toBe(creditTransfer.fromAccountId);
    expect(debitTransfer.fromAccountId).toBe(creditTransfer.toAccountId);
  });

  it('две одинаковые правки подряд — две операции, а не повтор', async () => {
    const person = await createTestPerson({ inProgram: true });
    await grantPoints(person.personId, 1);
    const { employeeId } = await createTestEmployee({ role: 'admin' });
    const input = { personId: person.personId, amount: 3, note: 'та же заметка', employeeId };

    await adjustPointsManually(input);
    await adjustPointsManually(input);

    // Одна от фикстуры и две правки.
    expect(await countTransfersByReason(person.personId, 'manual')).toBe(3);
    expect(await readAccountBalance(person.personId)).toBe(7n);
  });

  it('списание больше баланса отклоняется ядром: баланс прежний, записи нет', async () => {
    const person = await createTestPerson({ inProgram: true });
    await grantPoints(person.personId, 4);
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const emissionBefore = await readSystemBalance('emission');

    await expect(
      adjustPointsManually({
        personId: person.personId,
        amount: -5,
        note: 'больше, чем есть',
        employeeId,
      }),
    ).rejects.toBeInstanceOf(InsufficientPointsError);

    expect(await readAccountBalance(person.personId)).toBe(4n);
    expect(await readSystemBalance('emission')).toBe(emissionBefore);
    // Единственный `manual` — от фикстуры.
    expect(await countTransfersByReason(person.personId, 'manual')).toBe(1);
  });

  it('нецелая и нулевая сумма, пустая заметка и человек без счёта отклоняются до записи', async () => {
    const member = await createTestPerson({ inProgram: true });
    await grantPoints(member.personId, 2);
    const outsider = await createTestPerson({ inProgram: false });
    const { employeeId } = await createTestEmployee({ role: 'owner' });

    await expect(
      adjustPointsManually({ personId: member.personId, amount: 1.5, note: 'дробь', employeeId }),
    ).rejects.toBeInstanceOf(InvalidManualAmountError);

    await expect(
      adjustPointsManually({ personId: member.personId, amount: 0, note: 'ноль', employeeId }),
    ).rejects.toBeInstanceOf(InvalidManualAmountError);

    await expect(
      adjustPointsManually({ personId: member.personId, amount: 1, note: '   ', employeeId }),
    ).rejects.toBeInstanceOf(MissingManualNoteError);

    await expect(
      adjustPointsManually({ personId: outsider.personId, amount: 1, note: 'мимо', employeeId }),
    ).rejects.toBeInstanceOf(DriverAccountMissingError);

    expect(await readAccountBalance(member.personId)).toBe(2n);
    expect(await countTransfersByReason(member.personId, 'manual')).toBe(1);
    expect(await countTransfersByReason(outsider.personId, 'manual')).toBe(0);
  });
});
