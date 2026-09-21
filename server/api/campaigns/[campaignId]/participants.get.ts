import type {
  CampaignHalfCode,
  CampaignParticipantOutcome,
  CampaignParticipantState,
} from '#server/generated/prisma/enums';
import { readCampaignParticipants } from '#server/services/campaigns/readCampaignParticipants';
import { rethrowCampaignFailure } from '#server/utils/campaignFailure';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { readPositiveInteger, requireUuidParam } from '#server/utils/query';
import { CAMPAIGN_ROLES } from '#shared/access';
import { CAMPAIGN_PARTICIPANTS_LIMIT } from '#shared/campaign';
import type {
  CampaignParticipantSort,
  CampaignParticipantsResponse,
} from '#shared/types/campaign';

const HALVES: readonly CampaignHalfCode[] = ['a', 'b'];
const STATES: readonly CampaignParticipantState[] = ['invited', 'opened', 'joined', 'declined'];
const OUTCOMES: readonly CampaignParticipantOutcome[] = [
  'returned',
  'short',
  'joined_no_trips',
  'seen_not_joined',
  'no_response',
];
const SORTS: readonly CampaignParticipantSort[] = ['qualified_days', 'outcome_at'];

/** Значение фильтра из строки запроса. Незнакомое — «фильтр не задан», как испорченное смещение. */
const readChoice = <Value extends string>(value: unknown, choices: readonly Value[]): Value | null =>
  choices.find((choice) => choice === value) ?? null;

// Страница участников: имя, позывной, половина, состояние, когда сменилось, исход и зачётные
// дни. Фильтры `half`, `state` и `outcome`, порядок `sort` (`qualified_days`, `outcome_at`;
// без него — по фамилии), листание `limit` и `offset` — в строке запроса.
export default defineEventHandler(async (event): Promise<CampaignParticipantsResponse> => {
  await requireEmployeeRole(event, CAMPAIGN_ROLES);

  const campaignId = requireUuidParam(event, 'campaignId');
  const query = getQuery(event);

  try {
    return await readCampaignParticipants(
      campaignId,
      {
        half: readChoice(query.half, HALVES),
        state: readChoice(query.state, STATES),
        outcome: readChoice(query.outcome, OUTCOMES),
      },
      readChoice(query.sort, SORTS) ?? 'name',
      readPositiveInteger(query.limit, CAMPAIGN_PARTICIPANTS_LIMIT),
      readPositiveInteger(query.offset, 0),
    );
  } catch (error) {
    return rethrowCampaignFailure(error);
  }
});
