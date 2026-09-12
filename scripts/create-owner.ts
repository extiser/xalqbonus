import { consola } from 'consola';

import { db } from '#server/db';
import { PASSWORD_MIN_LENGTH } from '#server/services/employees/config';
import { createOwner } from '#server/services/employees/createOwner';

/**
 * Заведение первого владельца — единственный сотрудник, которого создают руками.
 *
 * Приглашением `owner` не заводится: приглашать можно роль строго ниже своей, а выше
 * владельца ролей нет (docs/decisions.md → «Учётка сотрудника и роли»). Отсюда начинается
 * вся цепочка: владелец приглашает админов, админы — менеджеров.
 *
 * Запуск — целью `make employee-owner` на локальном стенде и `make prod-employee-owner`
 * на боевой машине, в обоих случаях внутри app-контейнера: строка подключения с именем
 * `postgres` живёт там же, где тесты и перенос. На проде исполняется не этот файл, а его
 * бандл `.output/create-owner.mjs`: исходников и tsx в боевом образе нет (docker/Dockerfile).
 *
 * Идемпотентен: повторный прогон на существующем телефоне второй учётки не создаёт и пароль
 * не меняет. Цель выката, молча переустанавливающая пароль владельца, — это способ потерять
 * доступ на ровном месте; сменить пароль можно из приложения, своей же учёткой.
 */

const log = consola.withTag('create-owner');

const [phoneRaw, fullName, password] = process.argv.slice(2);

if (!phoneRaw || !fullName || !password) {
  log.error(
    'использование: make employee-owner (локально) или make prod-employee-owner (на машине) ' +
      'phone=+998XXXXXXXXX name="Имя Фамилия" password=<пароль>',
  );
  process.exit(1);
}

const result = await createOwner({ phoneRaw, fullName, password });

switch (result.outcome) {
  case 'created':
    log.success('владелец заведён', { employeeId: result.employeeId, phone: result.phoneE164 });
    break;

  case 'already_exists':
    // Не ошибка: цель обязана переживать повторный прогон, и в выкате это обычный случай.
    log.info('учётка на этот телефон уже есть — ничего не изменено', {
      employeeId: result.employeeId,
      phone: result.phoneE164,
    });
    break;

  case 'phone_invalid':
    log.error('номер не приводится к виду +998XXXXXXXXX');
    break;

  case 'password_too_short':
    log.error(`пароль короче ${PASSWORD_MIN_LENGTH} символов`);
    break;

  case 'name_empty':
    log.error('имя пустое');
    break;
}

await db.$disconnect();

// Ненулевой код на всех отказах: цель, сообщающая об ошибке нулевым кодом, не отличается
// от удачной ни для человека, который спешит, ни для скрипта выката.
process.exit(result.outcome === 'created' || result.outcome === 'already_exists' ? 0 : 1);
