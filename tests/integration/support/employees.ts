import { db } from '#server/db';
import type { EmployeeRole } from '#server/generated/prisma/enums';

/**
 * Фикстуры и уборка для тестов доступа сотрудников.
 *
 * Тесты ходят в настоящую базу, а не в заглушку, по той же причине, что тесты ядра баллов:
 * проверяются ровно те вещи, которых в заглушке нет — уникальность телефона и Telegram,
 * `CHECK` на способ входа, условие «принять можно только непринятое» внутри `UPDATE`.
 *
 * Уборка идёт по заведённым здесь учёткам, а не `TRUNCATE` по таблицам: база общая
 * с остальными тестами и с разведкой.
 */

const createdEmployeeIds = new Set<string>();

/**
 * Привязки и телефоны профилей, заведённые этими фикстурами.
 *
 * Уборка по людям из `support/database.ts` до них не доходит: она удаляет человека
 * и его профили, а привязка и телефон профиля ссылаются на них внешними ключами
 * и отбивают удаление. Поэтому фикстуры этого файла убирают за собой сами — и первыми.
 */
const createdLinkIds = new Set<string>();
const createdPhoneIds = new Set<string>();

/**
 * Telegram-идентификаторы фикстур: отрицательные и убывающие.
 *
 * Отрицательные намеренно — настоящих отрицательных `user_id` у Telegram не бывает,
 * и тест не может случайно занять число живого человека.
 *
 * Начало отсчёта случайное, а не постоянное: прогон, упавший посередине, оставляет
 * за собой привязки и учётки, и следующий прогон с тем же началом отсчёта падал бы
 * на уникальном индексе вместо того, чтобы показать настоящую причину.
 */
let lastTelegramUserId = -(1_000_000 + Math.floor(Math.random() * 900_000_000));

export const nextTestTelegramUserId = (): bigint => {
  lastTelegramUserId -= 1;

  return BigInt(lastTelegramUserId);
};

/**
 * Телефоны фикстур: канонический вид `+998` плюс девять цифр, иначе нормализация
 * их не пропустит. Начало отсчёта случайное — по той же причине, что у идентификаторов.
 */
let lastPhoneSuffix = 100_000_000 + Math.floor(Math.random() * 800_000_000);

export const nextTestPhone = (): string => {
  lastPhoneSuffix += 1;

  return `+998${lastPhoneSuffix}`;
};

export type CreateTestEmployeeInput = {
  role: EmployeeRole;
  phoneE164?: string;
  passwordHash?: string | null;
  passwordChangedAt?: Date | null;
  telegramUserId?: bigint | null;
  disabledAt?: Date | null;
};

export const createTestEmployee = async (
  input: CreateTestEmployeeInput,
): Promise<{ employeeId: string; phoneE164: string; telegramUserId: bigint | null }> => {
  const employee = await db.employee.create({
    data: {
      role: input.role,
      fullName: 'Тестовый Сотрудник',
      phoneE164: input.phoneE164 ?? nextTestPhone(),
      passwordHash: input.passwordHash ?? null,
      passwordChangedAt: input.passwordChangedAt ?? null,
      telegramUserId:
        input.telegramUserId === undefined ? nextTestTelegramUserId() : input.telegramUserId,
      disabledAt: input.disabledAt ?? null,
    },
  });

  createdEmployeeIds.add(employee.id);

  return {
    employeeId: employee.id,
    phoneE164: employee.phoneE164,
    telegramUserId: employee.telegramUserId,
  };
};

/** Учётка, заведённая сервисом, а не фикстурой, — чтобы уборка о ней тоже знала. */
export const trackTestEmployee = (employeeId: string): void => {
  createdEmployeeIds.add(employeeId);
};

export const readTestEmployee = async (employeeId: string) =>
  db.employee.findUnique({ where: { id: employeeId } });

export const readInviteById = async (inviteId: string) =>
  db.employeeInvite.findUnique({ where: { id: inviteId } });

/**
 * Активная водительская привязка на готового человека — вторая сторона правила «водителем
 * и сотрудником одновременно быть нельзя».
 *
 * `telegramUserId` пуст по умолчанию, и это не мелочь фикстуры: так выглядит почти весь
 * парк. У 4 091 привязки, перенесённой из старой базы, от Telegram сохранился один лишь
 * `chat_id` — отправителя старый бот не записывал вовсе (docs/decisions.md → «Из public
 * в xb переносятся водители и балансы»).
 */
export const linkTestDriver = async (
  personId: string,
  telegramChatId: bigint,
  telegramUserId: bigint | null = null,
): Promise<void> => {
  const link = await db.telegramLink.create({
    data: { personId, telegramChatId, telegramUserId, confirmedBy: 'phone_auto' },
  });

  createdLinkIds.add(link.id);
};

/** Активный телефон профиля парка — по нему идёт автопривязка и проверка пересечения. */
export const setTestProfilePhone = async (profileId: string, phoneE164: string): Promise<void> => {
  const phone = await db.profilePhone.create({
    data: { profileId, phoneRaw: phoneE164, phoneE164 },
  });

  createdPhoneIds.add(phone.id);
};

/**
 * Убирает учётки, заведённые тестом, и всё, что на них ссылается.
 *
 * Приглашения уходят первыми: у них внешние ключи на учётку с обеих сторон — и выпустивший,
 * и заведённый.
 */
export const cleanupTestEmployees = async (): Promise<void> => {
  const linkIds = [...createdLinkIds];
  const phoneIds = [...createdPhoneIds];
  createdLinkIds.clear();
  createdPhoneIds.clear();

  if (linkIds.length > 0) {
    await db.$executeRaw`DELETE FROM xb.telegram_links WHERE "id" = ANY(${linkIds}::uuid[])`;
  }

  if (phoneIds.length > 0) {
    await db.$executeRaw`DELETE FROM xb.profile_phones WHERE "id" = ANY(${phoneIds}::uuid[])`;
  }

  const employeeIds = [...createdEmployeeIds];
  createdEmployeeIds.clear();

  if (employeeIds.length === 0) {
    return;
  }

  await db.$executeRaw`
    DELETE FROM xb.employee_invites
     WHERE "invited_by_id" = ANY(${employeeIds}::uuid[])
        OR "employee_id" = ANY(${employeeIds}::uuid[])
  `;
  await db.$executeRaw`DELETE FROM xb.employees WHERE "id" = ANY(${employeeIds}::uuid[])`;
};
