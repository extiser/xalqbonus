import { listDemoDrivers, listDemoEntities, listDemoOffices, listDemoViewers } from '#server/repositories/demo';
import { listLiveDemoInvites } from '#server/repositories/demoInvites';
import { findDemoEmployee } from '#server/repositories/employees';
import { listEmployeeOffices } from '#server/repositories/offices';
import type { DemoDriverSummary, DemoOverviewResponse } from '#shared/types/demo';
import { formatPhone } from '#shared/phone';

/**
 * Всё для страницы «Демо» одним ответом (issue #252): живые приглашения, зрители,
 * демо-водители, демо-менеджер с его офисами, демо-офисы и сводка демо-сущностей.
 *
 * Одним ответом, а не ручкой на блок: после каждого действия страница перечитывает всё —
 * «Добавить поездки» меняет баланс в списке водителей, принятое приглашение уходит из живых
 * и появляется зрителем, — и блоки, перечитанные порознь, показывали бы разные моменты.
 */

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

  return {
    invites: invites.map((invite) => ({
      inviteId: invite.id,
      label: invite.label,
      expiresAt: invite.expiresAt.toISOString(),
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
