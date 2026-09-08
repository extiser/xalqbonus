/**
 * Перенос реестра парка и балансов из `public` в `xb`.
 *
 * Тонкая обвязка над сервисами: порядок шагов, сверка с контрольными цифрами, отчёт.
 * Бизнес-логика живёт в `server/services/legacyImport/`, доступ к данным — в репозиториях,
 * разбор выгрузки Fleet — в адаптере (docs/principles.md → «Слои и зависимости»).
 *
 * Контрольных цифр в коде нет: эталон снимается запросом к `public` и выгрузке реестра
 * в начале прогона, результат читается из `xb` после переноса, расхождение по любой
 * из семи величин останавливает прогон (`server/services/legacyImport/controlFigures.ts`).
 *
 * Шаги фиксированы и каждый идемпотентен по отдельности. Повторный прогон не создаёт
 * вторых людей, не задваивает балансы и не пишет вторую операцию `opening`: прогон
 * на 25 тысячах строк упадёт посередине хотя бы раз, и продолжать придётся с того же места.
 *
 * По отношению к `public` скрипт работает только на чтение, и это свойство сеанса,
 * а не дисциплины: соединение к старой схеме открыто с `default_transaction_read_only = on`.
 *
 * Запуск: make import-legacy
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { consola } from 'consola';

import { db } from '#server/db';
import {
  countByMatchMethod,
  countByTelegramStatus,
  readLegacyDriverMapCounts,
} from '#server/repositories/legacyDriverMap';
import { openLegacyReadSession } from '#server/repositories/legacyPublic';
import { readBalanceTotals, readOpeningTotal } from '#server/repositories/points';
import { countByConfirmedBy } from '#server/repositories/programMembership';
import { readRegistryCounts } from '#server/repositories/registry';
import {
  assertControlFigures,
  checkControlFigures,
  type ControlActual,
  type ControlBaseline,
  type ControlCheck,
} from '#server/services/legacyImport/controlFigures';
import { importBalances } from '#server/services/legacyImport/importBalances';
import { importProgramMembership } from '#server/services/legacyImport/importProgramMembership';
import { importRegistry } from '#server/services/legacyImport/importRegistry';
import { markRegistryWatermark } from '#server/services/legacyImport/markRegistryWatermark';
import { matchLegacyDrivers } from '#server/services/legacyImport/matchLegacyDrivers';

const log = consola.withTag('legacy-import');

const DEFAULT_DUMP = '_reference/fleet-api/dumps/driver-profiles-2026-08-27.jsonl';
const DEFAULT_REPORT = '_reference/legacy/import-report.md';

// Разряды разделяются пробелом. BigInt приводится к числу: `toLocaleString` группирует
// его не во всех сборках Node, а суммы переноса — девять миллионов, до предела точности
// числа с плавающей точкой отсюда девять порядков.
const formatNumber = (value: number | bigint): string =>
  Number(value).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');

const formatDate = (value: Date | null): string => (value ? value.toISOString() : '—');

const renderRow = (title: string, value: string): string => `| ${title} | ${value} |`;

const main = async (): Promise<void> => {
  const dumpPath = process.argv[2] ?? DEFAULT_DUMP;
  const reportPath = process.argv[3] ?? DEFAULT_REPORT;

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL не задана — переносу некуда и неоткуда ходить');
  }

  const startedAt = new Date();

  log.info(`выгрузка: ${dumpPath}`);

  // Шаги 1–2. Люди с удостоверениями и профили парка.
  const registry = await importRegistry(dumpPath, startedAt);

  // Шаг 3. Сопоставление со старой базой. Сеанс только для чтения: записать что-либо
  // в `public` он не может физически.
  const legacy = await openLegacyReadSession(databaseUrl);
  let legacyBaseline;
  let matchResult;

  try {
    // Эталон снимается здесь и дальше не пересчитывается. Место выбрано единственно
    // возможное: реестр парка в `xb` уже лежит — без него «сопоставленная запись»
    // не определена, — а карты переноса и балансов ещё нет. Снятый после переноса эталон
    // сравнивал бы результат сам с собой.
    legacyBaseline = await legacy.readControlBaseline();
    matchResult = await matchLegacyDrivers(await legacy.readDrivers());
  } finally {
    await legacy.close();
  }

  const { matches, summary: match } = matchResult;

  // Шаг 4. Участие в программе и привязки Telegram.
  const membership = await importProgramMembership(matches, startedAt);

  // Шаг 5. Балансы — одной операцией `opening` на человека, через сервис журнала.
  const balances = await importBalances(matches, startedAt);

  // Шаг 6. Отметка синхронизации реестра.
  const watermark = await markRegistryWatermark(dumpPath);

  // Шаг 7. Отчёт. Счётчики читаются из базы, а не из переменных прогона: отчёт должен
  // описывать состояние базы, а не намерения скрипта.
  const counts = await readRegistryCounts();
  const totals = await readBalanceTotals();
  const mapCounts = await readLegacyDriverMapCounts();
  const openingTotal = await readOpeningTotal();
  const telegramStatuses = await countByTelegramStatus();
  const matchMethods = await countByMatchMethod();
  const confirmedBy = await countByConfirmedBy();

  // Склеенные пары старая схема запросом не выводит: двойники опознаются реестром парка.
  // Люди с несколькими профилями к ней отношения не имеют вовсе — это свойство выгрузки.
  // Обе величины берутся правилами самого переноса, а не второй их реализацией.
  const baseline: ControlBaseline = {
    takenAt: legacyBaseline.takenAt,
    databaseName: legacyBaseline.databaseName,
    matchedRecords: legacyBaseline.matchedRecords,
    pointsTransferred: legacyBaseline.pointsTransferred,
    positiveBalances: legacyBaseline.positiveBalances,
    personsWithSeveralProfiles: registry.personsWithSeveralProfilesInDump,
    mergedPairs: match.mergedPairs,
    invalidChatIds: legacyBaseline.invalidChatIds,
    unmatchedRecords: legacyBaseline.unmatchedRecords,
  };

  // Результат читается из `xb`, а не из счётчиков прогона: счётчик знает, что скрипт
  // собирался записать, и о пропущенной вставке рассказать не может.
  const actual: ControlActual = {
    matchedRecords: mapCounts.matched,
    pointsTransferred: openingTotal,
    positiveBalances: mapCounts.positiveBalances,
    personsWithSeveralProfiles: registry.personsWithSeveralProfiles,
    mergedPairs: mapCounts.mergedPairs,
    invalidChatIds: mapCounts.invalidChatIds,
    unmatchedRecords: mapCounts.unmatched,
  };

  const checks = checkControlFigures(baseline, actual);

  const report = renderReport({
    dumpPath,
    startedAt,
    finishedAt: new Date(),
    readOnlyMode: legacy.readOnlyMode,
    registry,
    counts,
    match,
    membership,
    balances,
    totals,
    watermark,
    openingTotal,
    telegramStatuses,
    matchMethods,
    confirmedBy,
    baseline,
    checks,
  });

  console.log(report);

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report, 'utf8');

  log.success(`отчёт записан в ${reportPath}`);

  // Сверка последней: отчёт обязан лечь на диск и в этом случае тоже — разбираться
  // с расхождением проще, глядя на все цифры сразу, а не на одну строку исключения.
  assertControlFigures(checks);
};

type ReportInput = {
  dumpPath: string;
  startedAt: Date;
  finishedAt: Date;
  readOnlyMode: string;
  registry: Awaited<ReturnType<typeof importRegistry>>;
  counts: Awaited<ReturnType<typeof readRegistryCounts>>;
  match: Awaited<ReturnType<typeof matchLegacyDrivers>>['summary'];
  membership: Awaited<ReturnType<typeof importProgramMembership>>;
  balances: Awaited<ReturnType<typeof importBalances>>;
  totals: Awaited<ReturnType<typeof readBalanceTotals>>;
  watermark: Awaited<ReturnType<typeof markRegistryWatermark>>;
  openingTotal: number;
  telegramStatuses: Awaited<ReturnType<typeof countByTelegramStatus>>;
  matchMethods: Awaited<ReturnType<typeof countByMatchMethod>>;
  confirmedBy: Awaited<ReturnType<typeof countByConfirmedBy>>;
  baseline: ControlBaseline;
  checks: readonly ControlCheck[];
};

const renderReport = (input: ReportInput): string => {
  const lines: string[] = [];

  lines.push('# Отчёт прогона переноса из `public` в `xb`');
  lines.push('');
  lines.push(`Прогон: ${formatDate(input.startedAt)} — ${formatDate(input.finishedAt)}.`);
  lines.push(`Выгрузка реестра: \`${input.dumpPath}\`.`);
  lines.push(
    `Сеанс чтения старой схемы: \`default_transaction_read_only = ${input.readOnlyMode}\` — записать что-либо в \`public\` он не может физически.`,
  );
  lines.push('');
  lines.push('Персональных данных в отчёте нет: только агрегаты.');
  lines.push('');

  lines.push('## Контрольные цифры');
  lines.push('');
  lines.push(
    `Эталон снят ${formatDate(input.baseline.takenAt)} с базы \`${input.baseline.databaseName}\` — по старой схеме и выгрузке реестра, до шагов сопоставления, участия и балансов, — и больше не пересчитывался. Зашитых в код чисел нет: в день выката они будут другими (docs/roadmap.md → «Выход в прод»).`,
  );
  lines.push('');
  lines.push('| показатель | эталон | получилось | сошлось | эталон снят | результат прочитан |');
  lines.push('|---|---:|---:|---|---|---|');
  for (const check of input.checks) {
    lines.push(
      `| ${check.title} | ${formatNumber(check.expected)} | ${formatNumber(check.actual)} | ${check.matches ? 'да' : '**НЕТ**'} | ${check.baselineSource} | ${check.actualSource} |`,
    );
  }
  lines.push('');

  lines.push('## Реестр парка');
  lines.push('');
  lines.push('| показатель | значение |');
  lines.push('|---|---:|');
  lines.push(renderRow('профилей в выгрузке', formatNumber(input.registry.profilesSeen)));
  lines.push(renderRow('людей в `persons`', formatNumber(input.counts.persons)));
  lines.push(renderRow('строк `person_licenses`', formatNumber(input.counts.personLicenses)));
  lines.push(renderRow('профилей в `park_profiles`', formatNumber(input.counts.parkProfiles)));
  lines.push(
    renderRow(
      'людей с несколькими профилями в парке',
      formatNumber(input.registry.personsWithSeveralProfiles),
    ),
  );
  lines.push(renderRow('телефонов в `profile_phones`', formatNumber(input.counts.profilePhones)));
  lines.push(
    renderRow('профилей без телефона', formatNumber(input.registry.profilesWithoutPhone)),
  );
  lines.push(
    renderRow(
      'телефонов вне формы `+998XXXXXXXXX`',
      formatNumber(input.registry.phonesOutsideE164),
    ),
  );
  lines.push(
    renderRow(
      'первых записей `profile_status_events`',
      formatNumber(input.counts.profileStatusEvents),
    ),
  );
  lines.push('');

  lines.push('## Сопоставление со старой базой');
  lines.push('');
  lines.push('| показатель | значение |');
  lines.push('|---|---:|');
  lines.push(renderRow('записей `public."Drivers"`', formatNumber(input.match.legacyRecords)));
  lines.push(renderRow('сопоставлено', formatNumber(input.match.matched)));
  lines.push(renderRow('не сопоставлено', formatNumber(input.match.unmatched)));
  lines.push(renderRow('склеенных пар двойников', formatNumber(input.match.mergedPairs)));
  lines.push(
    renderRow('из них по общему `profile_id`', formatNumber(input.match.mergedByProfile)),
  );
  lines.push(
    renderRow('из них по каноническому номеру ВУ', formatNumber(input.match.mergedByLicense)),
  );
  lines.push(renderRow('непригодных `chat_id`', formatNumber(input.match.invalidChatIds)));
  lines.push('');
  lines.push('Метод сопоставления в `legacy_driver_map`:');
  lines.push('');
  lines.push('| метод | записей |');
  lines.push('|---|---:|');
  for (const [method, total] of input.matchMethods) {
    lines.push(`| \`${method}\` | ${formatNumber(total)} |`);
  }
  lines.push('');
  lines.push('Статус привязки в `legacy_driver_map`:');
  lines.push('');
  lines.push('| статус | записей |');
  lines.push('|---|---:|');
  for (const [status, total] of input.telegramStatuses) {
    lines.push(`| \`${status}\` | ${formatNumber(total)} |`);
  }
  lines.push('');

  lines.push('## Участие в программе');
  lines.push('');
  lines.push('| показатель | значение |');
  lines.push('|---|---:|');
  lines.push(renderRow('строк `person_settings`', formatNumber(input.counts.personSettings)));
  for (const [language, total] of input.membership.languages) {
    lines.push(renderRow(`язык \`${language}\``, formatNumber(total)));
  }
  lines.push(
    renderRow(
      'дата вступления раньше 19.12.2024 (когорта импорта)',
      formatNumber(input.membership.joinedBeforeImportCutoff),
    ),
  );
  lines.push(renderRow('привязок Telegram всего', formatNumber(
    input.membership.linksActive + input.membership.linksClosed,
  )));
  lines.push(renderRow('из них активных', formatNumber(input.membership.linksActive)));
  lines.push(
    renderRow(
      'из них закрытых (склеенные пары, канал ждёт ответа водителя)',
      formatNumber(input.membership.linksClosed),
    ),
  );
  lines.push(
    renderRow(
      'записано этим прогоном',
      formatNumber(input.membership.linksWritten),
    ),
  );
  lines.push(
    renderRow(
      'привязок не создано из-за непригодного `chat_id`',
      formatNumber(input.membership.linksSkippedInvalidChat),
    ),
  );
  lines.push('');
  lines.push('Способ подтверждения привязки в `telegram_links`:');
  lines.push('');
  lines.push('| `confirmed_by` | привязок |');
  lines.push('|---|---:|');
  for (const [value, total] of input.confirmedBy) {
    lines.push(`| \`${value}\` | ${formatNumber(total)} |`);
  }
  lines.push('');
  lines.push(
    'Перенесённые привязки лежат под `legacy_import`, а не под `operator`: ни автоматикой по телефону, ни оператором в офисе они не подтверждались. Значение заведено миграцией этой же ветки.',
  );
  lines.push('');

  lines.push('## Балансы');
  lines.push('');
  lines.push('| показатель | значение |');
  lines.push('|---|---:|');
  lines.push(renderRow('водительских счетов', formatNumber(input.totals.driverAccounts)));
  lines.push(
    renderRow('из них с положительным балансом', formatNumber(input.totals.driverAccountsPositive)),
  );
  lines.push(
    renderRow('людей с нулевым итогом (операция не пишется)', formatNumber(input.balances.personsWithZeroBalance)),
  );
  lines.push(
    renderRow('операций `opening` записано этим прогоном', formatNumber(input.balances.transfersApplied)),
  );
  lines.push(
    renderRow(
      'операций `opening` уже было записано раньше',
      formatNumber(input.balances.transfersAlreadyApplied),
    ),
  );
  lines.push(
    renderRow('**перенесено операциями `opening`**', `**${formatNumber(input.openingTotal)}**`),
  );
  lines.push(renderRow('сумма балансов в `xb`', formatNumber(input.totals.driverBalanceTotal)));
  lines.push(renderRow('баланс счёта `emission`', formatNumber(input.totals.emissionBalance)));
  lines.push('');

  lines.push('## Отметка синхронизации');
  lines.push('');
  lines.push('| показатель | значение |');
  lines.push('|---|---:|');
  lines.push(renderRow('обход реестра закончился', formatDate(input.watermark.dumpFinishedAt)));
  lines.push(
    renderRow('обход занял, секунд', formatNumber(Math.round(input.watermark.dumpElapsedSeconds))),
  );
  lines.push(renderRow('обход начался', formatDate(input.watermark.dumpStartedAt)));
  lines.push(
    renderRow('**`sync_state` вида `registry`**', `**${formatDate(input.watermark.storedWatermark)}**`),
  );
  lines.push('');
  lines.push(
    'Отметка равна времени **начала** выгрузки с запасом назад в сутки, а не времени прогона переноса. Виды `orders` и `orders_catchup` не тронуты: поездки не переносятся, окно опроса заказов назначается этапом 3.',
  );
  lines.push('');

  return lines.join('\n');
};

main()
  .catch((error: unknown) => {
    consola.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
