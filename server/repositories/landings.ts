import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';

/**
 * Лендинги «Промо» и их версии (issue #478).
 *
 * Какая версия действующая и можно ли лендинг выбрать, решает сервис по списку версий; здесь —
 * строки и то, что держит база: номер версии по порядку и запрет удалить лендинг, стоящий у метки.
 */

export type LandingVersionMeta = {
  id: string;
  number: number;
  passed: boolean;
  createdAt: Date;
};

export type LandingRecord = {
  id: string;
  name: string;
  archivedAt: Date | null;
  createdAt: Date;
  /** По возрастанию номера. */
  versions: LandingVersionMeta[];
  labelCount: number;
};

export type LandingVersionRecord = LandingVersionMeta & {
  html: string;
  checks: Prisma.JsonValue;
};

export type LandingVersionInput = {
  html: string;
  passed: boolean;
  checks: Prisma.InputJsonValue;
  uploadedByEmployeeId: string;
};

export type LandingLabelRecord = {
  code: string;
  name: string;
};

const RECORD_SELECT = {
  id: true,
  name: true,
  archivedAt: true,
  createdAt: true,
  versions: {
    select: { id: true, number: true, passed: true, createdAt: true },
    orderBy: { number: 'asc' },
  },
  _count: { select: { promoLinks: true } },
} satisfies Prisma.LandingSelect;

type RecordRow = Prisma.LandingGetPayload<{ select: typeof RECORD_SELECT }>;

const toRecord = (row: RecordRow): LandingRecord => ({
  id: row.id,
  name: row.name,
  archivedAt: row.archivedAt,
  createdAt: row.createdAt,
  versions: row.versions,
  labelCount: row._count.promoLinks,
});

/** Все лендинги: сначала не в архиве, потом в архиве; внутри — новые сверху. */
export const listLandingRecords = async (): Promise<LandingRecord[]> => {
  const rows = await db.landing.findMany({ select: RECORD_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
  const records = rows.map(toRecord);

  return [
    ...records.filter((record) => record.archivedAt === null),
    ...records.filter((record) => record.archivedAt !== null),
  ];
};

export const findLandingRecord = async (id: string): Promise<LandingRecord | null> => {
  const row = await db.landing.findUnique({ where: { id }, select: RECORD_SELECT });

  return row === null ? null : toRecord(row);
};

/** Версии с разметкой и проверкой — для предпросмотра. */
export const findLandingVersions = async (ids: readonly string[]): Promise<LandingVersionRecord[]> =>
  db.landingVersion.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, number: true, passed: true, createdAt: true, html: true, checks: true },
  });

/**
 * Метки, у которых стоит лендинг, новые сверху. `null` — метки экрана заявки по умолчанию:
 * реклама в Telegram со входом «Приложение» без лендинга.
 */
export const listLandingLabels = async (landingId: string | null): Promise<LandingLabelRecord[]> =>
  db.promoLink.findMany({
    where: landingId === null ? { landingId: null, medium: 'telegram_ad', entry: 'miniapp' } : { landingId },
    select: { code: true, name: true },
    orderBy: [{ createdAt: 'desc' }, { code: 'asc' }],
  });

/**
 * Заводит лендинг с версией 1 — одним запросом, то есть одной транзакцией: лендинга без версии
 * не бывает.
 */
export const insertLandingWithFirstVersion = async (
  name: string,
  version: LandingVersionInput,
): Promise<{ landingId: string; versionId: string }> => {
  const landing = await db.landing.create({
    data: {
      name,
      createdByEmployeeId: version.uploadedByEmployeeId,
      versions: { create: { number: 1, ...version } },
    },
    select: { id: true, versions: { select: { id: true } } },
  });

  const [first] = landing.versions;

  if (!first) {
    throw new Error(`лендинг ${landing.id} заведён без версии`);
  }

  return { landingId: landing.id, versionId: first.id };
};

/**
 * Новая версия с номером на 1 больше последней. `null` — лендинга нет.
 *
 * Номер считается внутри транзакции после записи в строку лендинга: запись держит строку
 * до конца транзакции, и две замены одного лендинга разом получают номера по очереди, а не
 * одинаковые. Уникальный индекс `(landing_id, number)` отбил бы второй и без этого — ошибкой,
 * а не новой версией.
 */
export const insertLandingVersion = async (
  landingId: string,
  version: LandingVersionInput,
): Promise<{ versionId: string; number: number } | null> =>
  db.$transaction(async (transaction) => {
    const { count } = await transaction.landing.updateMany({
      where: { id: landingId },
      data: { updatedAt: new Date() },
    });

    if (count === 0) return null;

    const last = await transaction.landingVersion.aggregate({
      where: { landingId },
      _max: { number: true },
    });

    const created = await transaction.landingVersion.create({
      data: { landingId, number: (last._max.number ?? 0) + 1, ...version },
      select: { id: true, number: true },
    });

    return { versionId: created.id, number: created.number };
  });

/** Снимает версию, файлы которой не легли на том. */
export const deleteLandingVersion = async (versionId: string): Promise<void> => {
  await db.landingVersion.deleteMany({ where: { id: versionId } });
};

/**
 * Удаляет лендинг вместе с версиями. Отдаёт id удалённых версий — их каталоги снимает сервис.
 *
 * `in_use` — лендинг стоит у метки. Число меток спрашивается в той же транзакции, а метку,
 * поставленную между вопросом и удалением, отбивает внешний ключ `promo_links.landing_id`
 * с `RESTRICT`: удаление тогда не проходит, и это тот же исход.
 */
export const deleteLandingWithVersions = async (
  landingId: string,
): Promise<{ outcome: 'deleted'; versionIds: string[] } | { outcome: 'in_use' | 'not_found' }> => {
  try {
    return await db.$transaction(async (transaction) => {
      const labels = await transaction.promoLink.count({ where: { landingId } });

      if (labels > 0) return { outcome: 'in_use' as const };

      const versions = await transaction.landingVersion.findMany({ where: { landingId }, select: { id: true } });

      await transaction.landingVersion.deleteMany({ where: { landingId } });

      const { count } = await transaction.landing.deleteMany({ where: { id: landingId } });

      return count === 0
        ? { outcome: 'not_found' as const }
        : { outcome: 'deleted' as const, versionIds: versions.map((version) => version.id) };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return { outcome: 'in_use' };
    }

    throw error;
  }
};

/** Ставит или снимает архив. `false` — лендинга нет. */
export const setLandingArchivedAt = async (landingId: string, archivedAt: Date | null): Promise<boolean> => {
  const { count } = await db.landing.updateMany({ where: { id: landingId }, data: { archivedAt } });

  return count === 1;
};

/**
 * Лендинги, которые можно выбрать у метки: не в архиве и с хоть одной прошедшей проверку
 * версией (docs/decisions.md → «Лендинги в „Промо“»). По названию.
 */
export const listSelectableLandings = async (): Promise<{ id: string; name: string }[]> =>
  db.landing.findMany({
    where: { archivedAt: null, versions: { some: { passed: true } } },
    select: { id: true, name: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });

/** Можно ли выбрать этот лендинг у метки — тем же правилом, что `listSelectableLandings`. */
export const isLandingSelectable = async (landingId: string): Promise<boolean> => {
  const landing = await db.landing.findFirst({
    where: { id: landingId, archivedAt: null, versions: { some: { passed: true } } },
    select: { id: true },
  });

  return landing !== null;
};
