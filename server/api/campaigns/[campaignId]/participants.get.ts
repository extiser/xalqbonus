import type {
  CampaignHalfCode,
  CampaignParticipantState,
} from '#server/generated/prisma/enums';
import { readCampaignParticipants } from '#server/services/campaigns/readCampaignParticipants';
import { rethrowCampaignFailure } from '#server/utils/campaignFailure';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { readPositiveInteger, requireUuidParam } from '#server/utils/query';
import { CAMPAIGN_ROLES } from '#shared/access';
import { CAMPAIGN_PARTICIPANTS_LIMIT } from '#shared/campaign';
import type { CampaignParticipantsResponse } from '#shared/types/campaign';

const HALVES: readonly CampaignHalfCode[] = ['a', 'b'];
const STATES: readonly CampaignParticipantState[] = ['invited', 'opened', 'joined', 'declined'];

/** Значение фильтра из строки запроса. Незнакомое — «фильтр не задан», как испорченное смещение. */
const readChoice = <Value extends string>(value: unknown, choices: readonly Value[]): Value | null =>
  choices.find((choice) => choice === value) ?? null;

// Страница участников: имя, позывной, половина, состояние и когда сменилось. Фильтры
// `half` и `state`, листание `limit` и `offset` — в строке запроса.
export default defineEventHandler(async (event): Promise<CampaignParticipantsResponse> => {
  await requireEmployeeRole(event, CAMPAIGN_ROLES);

  const campaignId = requireUuidParam(event, 'campaignId');
  const query = getQuery(event);

  try {
    return await readCampaignParticipants(
      campaignId,
      { half: readChoice(query.half, HALVES), state: readChoice(query.state, STATES) },
      readPositiveInteger(query.limit, CAMPAIGN_PARTICIPANTS_LIMIT),
      readPositiveInteger(query.offset, 0),
    );
  } catch (error) {
    return rethrowCampaignFailure(error);
  }
});
