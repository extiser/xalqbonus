import { changeMemberLanguage } from '#server/services/drivers/changeMemberLanguage';
import { isLanguage } from '#server/utils/language';
import { requireMember } from '#server/utils/miniAppMember';
import type { MiniAppLanguageRequestBody, MiniAppLanguageResponse } from '#shared/types/miniapp';

/**
 * Язык участника из шторки профиля.
 *
 * Чей язык — решают проверенная `initData` и активная привязка (`requireMember`); идентификатора
 * человека в запросе нет. Сам язык подписи не имеет и иметь не может — это выбор человека,
 * — поэтому сверяется со словарём, как на регистрации.
 */
export default defineEventHandler(async (event): Promise<MiniAppLanguageResponse> => {
  const driver = await requireMember(event);
  const body = await readBody<Partial<MiniAppLanguageRequestBody>>(event);

  if (!isLanguage(body?.language)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'язык должен быть «ru» или «uz»',
    });
  }

  return { language: await changeMemberLanguage(driver.personId, body.language) };
});
