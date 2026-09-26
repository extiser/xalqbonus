import { consola } from 'consola';

import { db } from '#server/db';
import { addDemoViewer, type AddDemoViewerResult } from '#server/services/demo/addDemoViewer';
import { createDemo, type CreateDemoResult } from '#server/services/demo/createDemo';
import { disableDemoViewer, type DisableDemoViewerResult } from '#server/services/demo/disableDemoViewer';

/**
 * Демо-доступ (issue #205) — одним скриптом на три цели: общее демо, внесение зрителя
 * и его выключение. Первым аргументом — что делать.
 *
 * Запуск — целями `make demo-create`, `make demo-viewer`, `make demo-viewer-off` на локальном
 * стенде и их `prod-` парами на боевой машине, в обоих случаях внутри app-контейнера. На проде
 * исполняется не этот файл, а его бандл `.output/create-demo.mjs`: исходников и tsx в боевом
 * образе нет (docker/Dockerfile).
 *
 * Все три повторяемы: повторный прогон ничего второй раз не заводит и говорит, что уже есть.
 */

const log = consola.withTag('create-demo');

const USAGE =
  'использование (локально — make demo-…, на машине — make prod-demo-…):\n' +
  '  make demo-create manager_phone=+998XXXXXXXXX\n' +
  '  make demo-viewer tg=<Telegram ID> label="Xalq Taxi, владелец"\n' +
  '  make demo-viewer-off tg=<Telegram ID>';

/** Telegram ID — целое положительное число. Всё остальное — опечатка в команде. */
const parseTelegramId = (raw: string | undefined): bigint | null =>
  raw !== undefined && /^[1-9]\d*$/.test(raw.trim()) ? BigInt(raw.trim()) : null;

const reportCreate = (result: CreateDemoResult): boolean => {
  switch (result.outcome) {
    case 'created':
      log.success('демо заведено', { officeId: result.officeId, employeeId: result.employeeId });

      return true;

    case 'already_exists':
      // Не ошибка: цель обязана переживать повторный прогон.
      log.info('демо уже заведено — ничего не изменено', {
        officeId: result.officeId,
        employeeId: result.employeeId,
        phone: result.phoneE164,
      });

      return true;

    case 'phone_invalid':
      log.error('номер не приводится к виду +998XXXXXXXXX');

      return false;

    case 'phone_taken':
      log.error('на этот телефон уже заведена учётка сотрудника — укажите другой номер');

      return false;

    case 'driver_link_exists':
      log.error(
        'телефон за активной водительской привязкой: водителем и сотрудником одновременно быть ' +
          'нельзя — укажите другой номер',
      );

      return false;
  }
};

const reportViewer = (result: AddDemoViewerResult): boolean => {
  switch (result.outcome) {
    case 'created':
      log.success('демо-зритель внесён, демо-водитель заведён', {
        personId: result.personId,
        balance: result.balance.toString(),
      });

      return true;

    case 'enabled':
      log.success('демо-зритель снова включён — прежний демо-водитель', {
        personId: result.personId,
        balance: result.balance.toString(),
      });

      return true;

    case 'label_updated':
      log.info('демо-зритель уже действует — обновлена подпись', {
        personId: result.personId,
        balance: result.balance.toString(),
      });

      return true;

    case 'label_empty':
      log.error('подпись пустая: укажите, кто это — label="Xalq Taxi, владелец"');

      return false;

    case 'telegram_linked':
      log.error(
        'у этого Telegram активная водительская привязка: демо-зритель не бывает живым участником',
      );

      return false;

    case 'telegram_employee':
      log.error('этот Telegram принадлежит сотруднику: демо-зритель не бывает сотрудником');

      return false;

    case 'no_source':
      log.error('нет участника программы с работающим профилем — условия работы демо-водителю взять не с кого');

      return false;
  }
};

const reportViewerOff = (result: DisableDemoViewerResult): boolean => {
  switch (result.outcome) {
    case 'disabled':
      log.success('демо-зритель выключен, привязка закрыта', { personId: result.personId });

      return true;

    case 'already_disabled':
      log.info('демо-зритель уже выключен — ничего не изменено', { personId: result.personId });

      return true;

    case 'unknown_viewer':
      log.error('этого Telegram в списке демо-зрителей нет');

      return false;
  }
};

const run = async (argv: string[]): Promise<boolean> => {
  const [command, first, second] = argv;

  if (command === 'create' && first) {
    return reportCreate(await createDemo(first));
  }

  const telegramUserId = parseTelegramId(first);

  if (command === 'viewer' && telegramUserId !== null && second !== undefined) {
    return reportViewer(await addDemoViewer({ telegramUserId, label: second }));
  }

  if (command === 'viewer-off' && telegramUserId !== null) {
    return reportViewerOff(await disableDemoViewer(telegramUserId));
  }

  log.error(USAGE);

  return false;
};

const succeeded = await run(process.argv.slice(2));

await db.$disconnect();

// Ненулевой код на всех отказах: цель, сообщающая об ошибке нулевым кодом, не отличается
// от удачной ни для человека, который спешит, ни для скрипта выката.
process.exit(succeeded ? 0 : 1);
