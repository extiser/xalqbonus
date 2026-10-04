import { promoQrFileName, renderPromoQr } from '#server/services/promo/renderPromoQr';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { promoNotFound, readPromoCodeParam, rejectPromoFailure } from '#server/utils/promoFailure';
import { sendReportFile } from '#server/utils/reportDownload';
import { PROMO_ROLES } from '#shared/access';

// QR метки файлом `promo-{код}.png` (issue #380). PNG шириной 1024 — для сообщений и просмотра.
export default defineEventHandler(async (event): Promise<Buffer> => {
  await requireEmployeeRole(event, PROMO_ROLES);

  const code = readPromoCodeParam(getRouterParam(event, 'code'));
  let content: Buffer | null;

  try {
    content = await renderPromoQr(code, 'png');
  } catch (error) {
    throw rejectPromoFailure(error);
  }

  if (content === null) {
    throw promoNotFound();
  }

  return sendReportFile(event, content, promoQrFileName(code, 'png'), 'image/png');
});
