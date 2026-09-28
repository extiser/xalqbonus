import type { Prisma } from '#server/generated/prisma/client';
import type { EmployeeAccessLinkKind } from '#server/generated/prisma/enums';
import { insertAccessLink, revokeOpenAccessLinks } from '#server/repositories/employeeAccessLinks';
import { createInviteToken, hashInviteToken } from '#server/services/employees/inviteToken';

/**
 * Выпуск одноразовой ссылки к учётке (issue #267) — внутри чужой транзакции: сброс пароля
 * выпускает ссылку той же транзакцией, что обнуляет пароль, и ссылка без сброса или сброс
 * без ссылки не остаются.
 *
 * Прежняя открытая ссылка того же вида отзывается: живая ссылка каждого вида у учётки одна,
 * и это держит частичный уникальный индекс `employee_access_links_open_key`. Вызывающий
 * держит строку учётки блокировкой (`lockEmployeeById`) — иначе две одновременные кнопки
 * разошлись бы на этом индексе ошибкой вместо очереди.
 */

export type IssueAccessLinkInput = {
  employeeId: string;
  kind: EmployeeAccessLinkKind;
  issuedById: string;
  lifetimeMs: number;
  now: Date;
};

export type IssuedAccessLink = {
  token: string;
  expiresAt: Date;
};

export const issueAccessLinkWithin = async (
  transaction: Prisma.TransactionClient,
  input: IssueAccessLinkInput,
): Promise<IssuedAccessLink> => {
  await revokeOpenAccessLinks(input.employeeId, input.kind, input.now, transaction);

  const token = createInviteToken();
  const link = await insertAccessLink(
    {
      employeeId: input.employeeId,
      kind: input.kind,
      token,
      tokenHash: hashInviteToken(token),
      expiresAt: new Date(input.now.getTime() + input.lifetimeMs),
      issuedById: input.issuedById,
    },
    transaction,
  );

  return { token, expiresAt: link.expiresAt };
};
