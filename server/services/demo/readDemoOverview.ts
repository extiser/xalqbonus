import { consola } from 'consola';

import { getBotUsername } from '#server/adapters/telegram/botIdentity';
import { readBotToken } from '#server/bot/config';
import { listDemoDrivers, listDemoEntities, listDemoOffices, listDemoViewers } from '#server/repositories/demo';
import { listLiveDemoInvites } from '#server/repositories/demoInvites';
import { findDemoEmployee } from '#server/repositories/employees';
import { listEmployeeOffices } from '#server/repositories/offices';
import { buildDemoInviteLink } from '#server/services/demo/demoInviteToken';
import type { DemoDriverSummary, DemoOverviewResponse } from '#shared/types/demo';
import { formatPhone } from '#shared/phone';

/**
 * Всё для страницы «Демо» одним ответом (issue #252): живые приглашения со ссылками, зрители,
 * демо-водители, демо-менеджер с его офисами, демо-офисы и сводка демо-сущностей.
 *
 * Одним ответом, а не ручкой на блок: после каждого действия страница перечитывает всё —
 * «Добавить поездки» меняет баланс в списке водителей, принятое приглашение уходит из живых
 * и появляется зрителем, — и блоки, перечитанные порознь, показывали бы разные моменты.
 */

const log = consola.withTag('demo:overview');

/**
 * Имя бота для ссылок живых приглашений. Пусто — бота нет или Telegram не ответил: сводка
 * без ссылок лучше сводки, которая не открылась. Имя кэшируется адаптером, и Telegram
 * спрашивается один раз на процесс.
 */
const readBotUsernameForLinks = async (): Promise<string | null> => {
  const botToken = readBotToken();

  if (botToken === '') {
    return null;
  }

  try {
    return await getBotUsername(botToken);
  } catch (error) {
    log.warn('имя бота не прочиталось — ссылки приглашений в сводке пустые', {
      error: error instanceof Error ? error.message : String(error),
    });

    return null;
  }
};

/** Демо-водители раздела — отдельно: их же перечитывает ответ генератора. */
export const readDemoDrivers = async (): Promise<DemoDriverSummary[]> =>
  (await listDemoDrivers()).map((row) => ({
    personId: row.personId,
    name: [row.firstName, row.lastName].filter(Boolean).join(' ').trim(),
    callsign: row.callsign ?? '',
    balance: Number(row.balance ?? 0n),
    programMember: row.programMember,
    lastTripAt: row.lastTripAt?.toISOString() ?? null,
    viewerLabel: row.viewerLabel,
  }));

export const readDemoOverview = async (now: Date = new Date()): Promise<DemoOverviewResponse> => {
  const [invites, viewers, drivers, manager, offices, entities] = await Promise.all([
    listLiveDemoInvites(now),
    listDemoViewers(),
    readDemoDrivers(),
    findDemoEmployee('manager'),
    listDemoOffices(),
    listDemoEntities(),
  ]);

  const managerOffices = manager ? await listEmployeeOffices(manager.id) : [];
  const botUsername = invites.some((invite) => invite.token !== null) ? await readBotUsernameForLinks() : null;

  return {
    invites: invites.map((invite) => ({
      inviteId: invite.id,
      label: invite.label,
      expiresAt: invite.expiresAt.toISOString(),
      link: invite.token !== null && botUsername !== null ? buildDemoInviteLink(botUsername, invite.token) : null,
    })),
    viewers: viewers.map((viewer) => ({
      telegramUserId: viewer.telegramUserId.toString(),
      label: viewer.label,
      role: viewer.currentRole,
      since: viewer.createdAt.toISOString(),
      disabled: viewer.disabledAt !== null,
      personId: viewer.personId,
    })),
    drivers,
    manager: manager
      ? {
          employeeId: manager.id,
          fullName: manager.fullName,
          phone: formatPhone(manager.phoneE164),
          officeIds: managerOffices.map((office) => office.id),
        }
      : null,
    demoOffices: offices.map((office) => ({ officeId: office.id, name: office.name })),
    entities: {
      products: entities.products.map((row) => ({ productId: row.id, name: row.name })),
      mailings: entities.mailings.map((row) => ({ mailingId: row.id, title: row.name })),
      segments: entities.segments.map((row) => ({ segmentId: row.id, name: row.name ?? '' })),
      campaigns: entities.campaigns.map((row) => ({ campaignId: row.id, title: row.name })),
    },
  };
};
