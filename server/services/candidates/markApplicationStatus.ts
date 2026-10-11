import type { CandidateApplicationEventKind, CandidateApplicationStatus } from '#server/generated/prisma/enums';
import { markApplicationStatus as markStatus } from '#server/repositories/candidateApplicationAdmin';
import { ApplicationDenialError } from '#server/services/candidates/applicationDenial';
import type { ApplicationMarkStatus } from '#shared/candidateApplications';

/**
 * Отметка сотрудника в заявке (issue #471, docs/decisions.md → «Заявки в админке»):
 *
 * - «Новая» или «В работе» → «Оформлен» или «Отказ»;
 * - «Оформлен» или «Отказ» → «В работе» — «Вернуть в работу»: ошибочную отметку надо уметь снять.
 *
 * Остальное — отказ `status_transition_invalid`: заявку уже отметили или вернули с другого экрана.
 * «Новая» → «В работе» отметкой не ставится — это делает первый ответ сотрудника.
 *
 * Вернуть в работу нельзя, если у кандидата уже есть другая открытая заявка — на тот же Telegram
 * или на тот же номер из Telegram: отказ `open_application_exists` (docs/decisions.md → «Заявка
 * кандидата»). Возврат в работу закрывает этой заявкой незаконченный черновик заявки в чате,
 * чтобы сообщения кандидата шли в тему, а не в черновик.
 *
 * Статус, строка журнала, «ведёт», если заявку ещё никто не вёл, и черновик — одной транзакцией.
 */

const TRANSITIONS: Readonly<
  Record<ApplicationMarkStatus, { from: readonly CandidateApplicationStatus[]; event: CandidateApplicationEventKind }>
> = {
  hired: { from: ['new', 'in_progress'], event: 'hired' },
  rejected: { from: ['new', 'in_progress'], event: 'rejected' },
  in_progress: { from: ['hired', 'rejected'], event: 'reopened' },
};

export const markApplicationStatus = async (input: {
  applicationId: string;
  status: ApplicationMarkStatus;
  employeeId: string;
}): Promise<{ status: CandidateApplicationStatus }> => {
  const transition = TRANSITIONS[input.status];
  const outcome = await markStatus({
    applicationId: input.applicationId,
    fromStatuses: transition.from,
    status: input.status,
    eventKind: transition.event,
    employeeId: input.employeeId,
    closeChatDraft: input.status === 'in_progress',
  });

  if (outcome === 'not_found') {
    throw new ApplicationDenialError('application_not_found');
  }

  if (outcome === 'transition_invalid') {
    throw new ApplicationDenialError('status_transition_invalid');
  }

  if (outcome === 'open_application_exists') {
    throw new ApplicationDenialError('open_application_exists');
  }

  return { status: input.status };
};
