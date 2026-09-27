import { DEMO_TRIPS_MAX } from '#server/services/demo/addDemoTrips';
import { NoDemoSourceError } from '#server/services/demo/createDemoDriver';
import { InvalidDemoGenerateError } from '#server/services/demo/errors';
import { DEMO_GENERATE_MAX, generateDemoDrivers } from '#server/services/demo/generateDemoDrivers';
import { readDemoDrivers } from '#server/services/demo/readDemoOverview';
import { plainText } from '#server/bot/texts';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { DEMO_EDITOR_ROLES } from '#shared/access';
import type { DemoGenerateField, DemoGenerateResponse, DemoProgramMember } from '#shared/types/demo';

// Генератор демо-водителей (issue #252). Строки из клиента разбираются здесь, а проверяет
// их сервис: границы и порядок полей — правила операции, а не формат запроса.
type GenerateBody = Partial<Record<DemoGenerateField, unknown>>;

const MESSAGES: Readonly<Record<DemoGenerateField, string>> = {
  count: `сколько водителей — целое число от 1 до ${DEMO_GENERATE_MAX}`,
  balanceMin: 'баланс «от» — целое число, 0 и больше',
  balanceMax: 'баланс «до» — целое число, не меньше «от»',
  tripsMin: `поездок «от» — целое число от 0 до ${DEMO_TRIPS_MAX}`,
  tripsMax: `поездок «до» — целое число, не меньше «от» и не больше ${DEMO_TRIPS_MAX}`,
  lastTripDaysMin: 'последняя поездка «от» — целое число дней, 0 и больше',
  lastTripDaysMax: 'последняя поездка «до» — целое число дней, не меньше «от»',
  programMember: 'участие — да, нет или вперемешку',
};

/** Не число — число, которого нет: сервис откажет полем. */
const numberOf = (value: unknown): number => (typeof value === 'number' ? value : Number.NaN);

const programMemberOf = (value: unknown): DemoProgramMember | null =>
  value === 'yes' || value === 'no' || value === 'mixed' ? value : null;

const invalid = (field: DemoGenerateField) =>
  createError({
    statusCode: 400,
    statusMessage: 'Bad Request',
    message: MESSAGES[field],
    data: { field },
  });

export default defineEventHandler(async (event): Promise<DemoGenerateResponse> => {
  await requireEmployeeRole(event, DEMO_EDITOR_ROLES);

  const body = await readBody<GenerateBody | null>(event);
  const programMember = programMemberOf(body?.programMember);

  if (programMember === null) {
    throw invalid('programMember');
  }

  try {
    const { created } = await generateDemoDrivers({
      count: numberOf(body?.count),
      balanceMin: numberOf(body?.balanceMin),
      balanceMax: numberOf(body?.balanceMax),
      tripsMin: numberOf(body?.tripsMin),
      tripsMax: numberOf(body?.tripsMax),
      lastTripDaysMin: numberOf(body?.lastTripDaysMin),
      lastTripDaysMax: numberOf(body?.lastTripDaysMax),
      programMember,
    });

    return { created, drivers: await readDemoDrivers() };
  } catch (error) {
    if (error instanceof InvalidDemoGenerateError) {
      throw invalid(error.field);
    }

    if (error instanceof NoDemoSourceError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: plainText('demo_invite_no_source', 'ru'),
      });
    }

    throw error;
  }
});
