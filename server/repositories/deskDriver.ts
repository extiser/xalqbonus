import { Prisma } from '#server/generated/prisma/client';

/**
 * Водитель у стойки: имя и позывной из профиля парка и открытый телефон — одним куском SQL
 * на карточки заказа и награды (issue #172).
 *
 * Профилей у человека бывает несколько, и берётся тот же, по которому его называет бот:
 * работающий, а из них свежайший (`findDisplayProfile`). Своего правила выбора профиля здесь
 * нет — два правила однажды назвали бы одного водителя двумя именами.
 *
 * Телефон — открытый номер этого профиля (`closed_at IS NULL`), свежайший из открытых.
 * У 9.9% профилей телефона нет вовсе, и соединение левое: карточка переживает это прочерком.
 * Показывается канонический вид, а если номер к нему не приводится — как пришёл из реестра.
 *
 * Куски подставляются в запрос вызывающего: `DESK_DRIVER_COLUMNS` — в список колонок,
 * `deskDriverJoins` — после `FROM`, с колонкой человека той таблицы, которую читают.
 */

export type DeskDriverColumns = {
  firstName: string | null;
  lastName: string | null;
  callsign: string | null;
  phone: string | null;
};

export const DESK_DRIVER_COLUMNS = Prisma.sql`
  profile."first_name" AS "firstName",
  profile."last_name"  AS "lastName",
  profile."callsign",
  COALESCE(phone."phone_e164", phone."phone_raw") AS "phone"
`;

export const deskDriverJoins = (personIdColumn: Prisma.Sql): Prisma.Sql => Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT candidate."profile_id",
           candidate."first_name",
           candidate."last_name",
           candidate."callsign"
      FROM xb.park_profiles AS candidate
     WHERE candidate."person_id" = ${personIdColumn}
     ORDER BY (candidate."work_status" = 'working') DESC, candidate."api_updated_at" DESC
     LIMIT 1
  ) AS profile ON true
  LEFT JOIN LATERAL (
    SELECT candidate."phone_e164",
           candidate."phone_raw"
      FROM xb.profile_phones AS candidate
     WHERE candidate."profile_id" = profile."profile_id"
       AND candidate."closed_at" IS NULL
     ORDER BY candidate."observed_at" DESC
     LIMIT 1
  ) AS phone ON true
`;

/**
 * «Фамилия Имя» — порядком реестра парка, как в поиске водителя в вебе.
 * Пусто и то и другое — `null`: выдумывать имя экрану незачем, он поставит прочерк.
 */
export const deskDriverName = (row: Pick<DeskDriverColumns, 'firstName' | 'lastName'>): string | null => {
  const name = [row.lastName, row.firstName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' ');

  return name === '' ? null : name;
};
