import { consola } from 'consola';

import { db } from '#server/db';
import type { Language, LinkAttemptOutcome } from '#server/generated/prisma/enums';
import { findPersonSettings } from '#server/repositories/drivers';
import { findEmployeeByTelegramOrPhone } from '#server/repositories/employees';
import {
  findActiveLinkByChat,
  findActiveLinkByPerson,
  insertTelegramLinks,
  upsertPersonSettings,
} from '#server/repositories/programMembership';
import { findActiveProfilesByPhone, type ProfileByPhoneRow } from '#server/repositories/registry';
import { insertTelegramLinkAttempt } from '#server/repositories/telegramLinkAttempts';
import { displayName, type LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import {
  ParkLookupFailedError,
  runProfileSyncByPhone,
} from '#server/services/sync/syncProfileByPhone';
import { normalizePhoneE164 } from '#server/utils/phoneNumber';
import { describeDatabaseFailure, UNIQUE_VIOLATION } from '#server/utils/postgresErrors';

/**
 * Привязка Telegram к записи реестра по подтверждённому телефону.
 *
 * Здесь живут правила, а не дверь: вызывающий — ручка приложения — эту функцию только
 * зовёт и рисует ответ. Регистрация **никогда не создаёт водителя**: она связывает Telegram
 * с записью, которая уже есть в реестре парка (docs/drivers.md).
 *
 * Источник телефона сменился с чата на Mini App (`#86`), правила от этого не изменились
 * ни в одной ветке: сюда приходит подтверждённый номер и владелец контакта, а чем именно
 * они подтверждены — кнопкой в чате или подписанной строкой `requestContact` — функция
 * не знает и знать не должна.
 *
 * Автоматика строится на одном признаке — подтверждённом телефоне из Telegram. Всё
 * остальное, что водитель может ввести руками, секретом от коллег не является: машину
 * видно каждый день, права он показывает. Поэтому исходов одиннадцать, и каждый из них
 * пишется в журнал попыток — включая удачный.
 *
 * Чего здесь нет и не будет:
 *
 *   - **перепривязки ни в каком виде.** Человек с активной привязкой, пришедший с нового
 *     Telegram, уходит в офис — даже когда телефон совпал идеально. Смена канала связи
 *     это операция оператора, с уведомлением на прежний чат, а не побочный эффект
 *     регистрации. Ровно эта ветка в старом боте (`chat_id_updated`) переписывала `chat_id`
 *     молча и без следа;
 *   - **приветственного бонуса.** Он привязан к пятой завершённой поездке, а не к привязке,
 *     и живёт на стороне синхронизации заказов. Здесь он только обещан текстом;
 *   - **записи в реестр.** Профиль заводит прогон синхронизации, и только он.
 */

const log = consola.withTag('drivers:register');

/** Откуда пришло участие. Значение колонки `person_settings.joined_source`. */
const JOINED_SOURCE = 'telegram';

/** Статус уволенного в Fleet API. Значение чужого словаря, поэтому строкой. */
const FIRED = 'fired';

export type RegistrationRequest = {
  /**
   * Чат, в который система пишет этому человеку.
   *
   * Приходит из проверенного подписью источника и ниоткуда больше: в Mini App чата нет
   * вовсе, и для личной переписки идентификатор чата равен `user.id` из `initData`.
   */
  telegramChatId: bigint;
  /** Кто пришёл — `user.id` из `initData` либо `from.id` у апдейта бота. */
  telegramUserId: bigint | null;
  /**
   * Владелец присланного контакта — `contact.user_id`.
   *
   * Пуст, если контакт не принадлежит пользователю Telegram: такой контакт ничего
   * не подтверждает и принят не будет.
   */
  contactUserId: bigint | null;
  phoneRaw: string;
  /** Выбранный язык. Доезжает до базы только вместе с началом участия. */
  language: Language;
};

export type RegistrationResult =
  | {
      outcome: 'linked';
      driver: LinkedDriver;
      /** Участие открыто этой привязкой. У перенесённых из старой базы — `false`. */
      isNewMember: boolean;
    }
  | { outcome: Exclude<LinkAttemptOutcome, 'linked'> };

/** Пара человек+чат уже лежит в истории привязок закрытой строкой. */
class LinkClosedInHistoryError extends Error {
  constructor(public readonly personId: string) {
    super(`привязка человека ${personId} к этому чату уже закрыта в истории`);
    this.name = 'LinkClosedInHistoryError';
  }
}

/** Что из номера попадает в строку журнала. Обе колонки пусты там, где номер чужой. */
type AttemptPhone = { raw: string; e164: string | null };

/**
 * Номер, которого в журнале не будет.
 *
 * Стоит ровно у исхода `contact_not_own`: там номер принадлежит человеку, который нам
 * ничего не присылал, о программе не знает и спросить его мы не можем. Хранить чужие
 * персональные данные ради счёта попыток незачем — счёт от их отсутствия не страдает,
 * строка пишется как и прежде.
 */
const NO_PHONE: AttemptPhone = { raw: '', e164: null };

/**
 * Пишет строку попытки и отдаёт исход наверх.
 *
 * Все выходы из функции идут через неё: попытка без записи неотличима от «водитель
 * не приходил», а по долям исходов считается, работает ли автопривязка вообще.
 */
const recordAttempt = async (
  request: RegistrationRequest,
  phone: AttemptPhone,
  outcome: LinkAttemptOutcome,
  found: { profileId: string | null; personId: string | null } = { profileId: null, personId: null },
): Promise<void> => {
  await insertTelegramLinkAttempt({
    telegramChatId: request.telegramChatId,
    telegramUserId: request.telegramUserId,
    phoneRaw: phone.raw,
    phoneE164: phone.e164,
    outcome,
    profileId: found.profileId,
    personId: found.personId,
  });

  // Телефон в лог не идёт: он персональные данные. Чат и вид исхода — то, чем потом
  // объясняется, почему водитель пришёл в офис.
  log.info('попытка привязки', {
    chatId: request.telegramChatId.toString(),
    outcome,
    profileId: found.profileId,
  });
};

/**
 * Профиль, на котором сходится привязка.
 *
 * Исход вместо профиля значит, что привязывать не к чему.
 *
 * **Уволенный не привязывается** — и не для строгости: у работающего водителя номер
 * поддерживает парк, а номер уволенного два года назад мог быть сдан и выдан другому
 * человеку — тот пройдёт все проверки честно и получит чужой баланс (docs/drivers.md).
 *
 * **Несколько профилей у одного человека — это норма, а не повод для офиса.** Человека
 * переоформляют в парке, и 672 номера удостоверений принадлежат 1 380 профилям: учётка
 * не является личностью, баланс принадлежит человеку. Привязка в этом случае однозначна,
 * и профиль берётся первый — список уже отсортирован правилом показа (`findActiveProfilesByPhone`).
 *
 * В офис уходит только настоящая неоднозначность: один номер на рабочих профилях **разных
 * людей**. Тут выбор принадлежит оператору, который видит водителя с документами.
 */
const pickProfile = (
  profiles: readonly ProfileByPhoneRow[],
): { profile: ProfileByPhoneRow } | { outcome: 'profile_fired' | 'several_profiles' } => {
  const working = profiles.filter((profile) => profile.workStatus !== FIRED);
  const first = working[0];

  if (!first) {
    return { outcome: 'profile_fired' };
  }

  if (working.some((profile) => profile.personId !== first.personId)) {
    return { outcome: 'several_profiles' };
  }

  return { profile: first };
};

/**
 * Какой из частичных уникальных индексов отбил вставку.
 *
 * Проверки «свободен ли человек» и «свободен ли чат» стоят в коде выше и никуда
 * не денутся, но они последняя линия, а не единственная: между чтением и вставкой
 * успевает вклиниться второй апдейт. Отбитая база — это исход «в офис», а не падение
 * обработчика (docs/principles.md → «Идемпотентность вместо аккуратности»).
 */
const outcomeForConstraint = (
  error: unknown,
): 'person_already_linked' | 'telegram_already_linked' | null => {
  const failure = describeDatabaseFailure(error);

  if (!failure || failure.code !== UNIQUE_VIOLATION) {
    return null;
  }

  if (failure.constraintName === 'telegram_links_active_chat_key') {
    return 'telegram_already_linked';
  }

  // Своим индексом отбились и «вторая привязка человека», и всё прочее, что мы могли
  // не предусмотреть: исход «в офис» верен в обоих случаях, а имя ограничения уже в логе.
  return 'person_already_linked';
};

export const registerDriverByContact = async (
  request: RegistrationRequest,
): Promise<RegistrationResult> => {
  // Контакт подтверждает телефон, только если принадлежит отправителю. В чате его
  // прикладывали не только кнопкой — через скрепку шлётся любая запись адресной книги,
  // — а в Mini App `contact.user_id` приезжает подписанной строкой и сверяется с `user.id`
  // из `initData`. Старый бот брал `contact.phone_number` как есть, и знания номера коллеги
  // хватало, чтобы его аккаунт вместе с баллами переехал на отправителя (docs/drivers.md
  // → «Телефон подтверждает только сам владелец»).
  //
  // Проверка идёт до нормализации номера: чужой номер здесь ни во что не превращается
  // и никуда не записывается.
  if (
    request.contactUserId === null ||
    request.telegramUserId === null ||
    request.contactUserId !== request.telegramUserId
  ) {
    await recordAttempt(request, NO_PHONE, 'contact_not_own');

    return { outcome: 'contact_not_own' };
  }

  const phoneE164 = normalizePhoneE164(request.phoneRaw);
  const phone: AttemptPhone = { raw: request.phoneRaw, e164: phoneE164 };

  // Номер, который не приводится к каноническому виду, искать в реестре нечем: по этому
  // полю идёт автопривязка, и дописывать за водителя код страны нельзя — номер с чужим
  // кодом найдёт постороннего человека вместе с его баллами.
  if (!phoneE164) {
    await recordAttempt(request, phone, 'not_in_registry');

    return { outcome: 'not_in_registry' };
  }

  // Сотрудник, приславший боту контакт как водитель, получает отказ, а не вторую роль:
  // водителем и сотрудником одновременно быть нельзя, и вторая сторона этого же правила
  // стоит при принятии приглашения (docs/decisions.md → «Учётка сотрудника и роли»).
  //
  // Проверка идёт до похода в Fleet API: решение о водителе она не меняет, а вот лишний
  // запрос во внешнюю систему на узкой квоте — меняет.
  const employee = await findEmployeeByTelegramOrPhone(request.telegramUserId, phoneE164);

  if (employee) {
    log.info('контакт прислал сотрудник парка — регистрация водителя отклонена', {
      chatId: request.telegramChatId.toString(),
      employeeId: employee.id,
    });

    await recordAttempt(request, phone, 'employee_account');

    return { outcome: 'employee_account' };
  }

  let profiles = await findActiveProfilesByPhone(phoneE164);
  // Знает ли парк этот номер вообще. Отличает «в парке такого нет» от «профиль есть,
  // но завести его в реестре нечем» — например, он пришёл без номера удостоверения.
  let knownToPark = profiles.length > 0;

  if (profiles.length === 0) {
    try {
      // Регистрация в реестр не пишет: она просит сходить в Fleet API сервис синхронизации,
      // и тот записывает найденное сам, своим обычным путём.
      knownToPark = (await runProfileSyncByPhone(phoneE164)).profilesSeen > 0;
    } catch (error) {
      // Отказ внешнего сервиса не является решением о водителе: отправлять человека в офис
      // из-за чужого таймаута значит создавать поход, который не был нужен.
      //
      // Водителю оба отказа показываются одинаково — сказать ему «у нас упала база» нечего,
      // делать с этим ему нечего. А вот в логе это два разных происшествия: отказ парка
      // проходит сам, отказ нашей базы значит, что не работает вовсе ничего и никакая
      // регистрация сейчас не пройдёт.
      log.error(
        error instanceof ParkLookupFailedError
          ? 'Fleet API не ответил на поиск по телефону — исход «попробуйте позже»'
          : 'точечный прогон упал не на стороне парка — отказала наша база, исход «попробуйте позже»',
        {
          chatId: request.telegramChatId.toString(),
          error: error instanceof Error ? error.message : String(error),
        },
      );

      await recordAttempt(request, phone, 'park_api_unavailable');

      return { outcome: 'park_api_unavailable' };
    }

    profiles = await findActiveProfilesByPhone(phoneE164);
  }

  if (profiles.length === 0) {
    const outcome = knownToPark ? 'not_in_registry' : 'not_in_park';
    await recordAttempt(request, phone, outcome);

    return { outcome };
  }

  const picked = pickProfile(profiles);

  if ('outcome' in picked) {
    // Профиль в строку попытки пишется и здесь: без него потом не ответить, кого именно
    // не пустили.
    const first = profiles[0] as ProfileByPhoneRow;
    await recordAttempt(request, phone, picked.outcome, {
      profileId: first.profileId,
      personId: first.personId,
    });

    return { outcome: picked.outcome };
  }

  const { profile } = picked;
  const found = { profileId: profile.profileId, personId: profile.personId };

  const personLink = await findActiveLinkByPerson(profile.personId);

  if (personLink && personLink.telegramChatId !== request.telegramChatId) {
    await recordAttempt(request, phone, 'person_already_linked', found);

    return { outcome: 'person_already_linked' };
  }

  const chatLink = await findActiveLinkByChat(request.telegramChatId);

  if (chatLink && chatLink.personId !== profile.personId) {
    await recordAttempt(request, phone, 'telegram_already_linked', found);

    return { outcome: 'telegram_already_linked' };
  }

  // Строка участия читается до записи: у переносившихся из старой базы она уже есть,
  // и язык в ней не перезатирается. Выбор в боте относится к новому участнику, а у старого
  // язык — его собственная настройка, которую он однажды уже сделал.
  const settings = await findPersonSettings(profile.personId);
  const alreadyLinked = personLink !== null;
  let points = 0n;

  try {
    // Одной транзакцией: частичный результат — это человек, который в программе,
    // но без канала, и разбираться с ним придётся руками.
    await db.$transaction(async (transaction) => {
      if (!alreadyLinked) {
        const written = await insertTelegramLinks(
          [
            {
              personId: profile.personId,
              telegramChatId: request.telegramChatId,
              telegramUserId: request.telegramUserId,
              closedAt: null,
              closeReason: null,
            },
          ],
          'phone_auto',
          transaction,
        );

        // Ноль означает единственное: эта пара человек+чат уже лежит в истории закрытой
        // строкой — её закрыл оператор или склейка двойников. Молча объявить успех нельзя,
        // активной привязки от этого не появится; вернуть человека к прежнему каналу —
        // тоже операция оператора.
        if (written === 0) {
          throw new LinkClosedInHistoryError(profile.personId);
        }
      }

      if (!settings) {
        await upsertPersonSettings(
          [{ personId: profile.personId, language: request.language, joinedAt: new Date() }],
          JOINED_SOURCE,
          transaction,
        );
      }

      // Участие началось — счёт должен существовать, даже если баланс нулевой.
      points = (await ensureDriverAccount(profile.personId, transaction)).balance;
    });
  } catch (error) {
    const constraintOutcome = outcomeForConstraint(error);

    if (constraintOutcome) {
      log.warn('привязку отбило ограничение базы — исход «в офис»', {
        chatId: request.telegramChatId.toString(),
        constraint: describeDatabaseFailure(error)?.constraintName ?? null,
      });

      await recordAttempt(request, phone, constraintOutcome, found);

      return { outcome: constraintOutcome };
    }

    // Своим исходом, а не `person_already_linked`, которым это писалось раньше. Поведение
    // было верным и не меняется — активной привязки нет ни у кого, а вернуть закрытый
    // канал связи может только оператор, — врал журнал: в разборе строка читалась как
    // занятый чужой Telegram, то есть как совсем другой разговор у стойки в офисе (`#86`).
    if (error instanceof LinkClosedInHistoryError) {
      log.warn('привязка этой пары человек+чат закрыта в истории — исход «в офис»', {
        chatId: request.telegramChatId.toString(),
      });

      await recordAttempt(request, phone, 'link_closed_in_history', found);

      return { outcome: 'link_closed_in_history' };
    }

    throw error;
  }

  await recordAttempt(request, phone, 'linked', found);

  return {
    outcome: 'linked',
    driver: {
      personId: profile.personId,
      name: displayName(profile.firstName, profile.lastName),
      points,
      // У нового участника это только что выбранный язык — он же уехал в `person_settings`.
      // У существующего участия берётся язык из него: перезаписывать его нельзя, а ответить
      // на выбранном сейчас значило бы сказать одно сообщение по-узбекски и все следующие
      // по-русски — язык участника после этой привязки не изменился.
      language: settings?.language ?? request.language,
    },
    // Приветственный текст с обещанием бонуса — только новому участнику. Перенесённому
    // из старой базы показывается его баланс: обещать ему первые пять поездок незачем.
    isNewMember: !settings,
  };
};
