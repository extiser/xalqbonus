import QRCode, { type QRCodeToBufferOptions, type QRCodeToStringOptions } from 'qrcode';

import { findPromoLink } from '#server/repositories/promo';
import { readPromoLinkUrl } from '#server/services/promo/promoLinkUrl';

/**
 * QR метки для печати и сообщений (issue #380): голый код ссылки метки, без рамки и подписи.
 * Коррекция H — плакат переживёт царапину и блик; поле вокруг — 4 модуля,
 * как требует стандарт; тёмный — `--color-web-page`, на белом.
 *
 * SVG — для печати любого размера, PNG шириной 1024 — для сообщений и просмотра.
 * `null` — метки с таким кодом нет.
 */

const QR_BASE = {
  errorCorrectionLevel: 'H',
  margin: 4,
  color: { dark: '#081114', light: '#ffffff' },
} as const;

const PNG_WIDTH = 1024;

export type PromoQrFormat = 'svg' | 'png';

export const renderPromoQr = async (code: string, format: PromoQrFormat): Promise<Buffer | null> => {
  const promo = await findPromoLink(code);

  if (promo === null) {
    return null;
  }

  const link = await readPromoLinkUrl(promo.code, promo.medium);

  if (format === 'svg') {
    const options: QRCodeToStringOptions = { ...QR_BASE, type: 'svg' };

    return Buffer.from(await QRCode.toString(link, options), 'utf8');
  }

  const options: QRCodeToBufferOptions = { ...QR_BASE, type: 'png', width: PNG_WIDTH };

  return QRCode.toBuffer(link, options);
};

/** Имя файла: `promo-p_poster1.svg`. */
export const promoQrFileName = (code: string, format: PromoQrFormat): string => `promo-${code}.${format}`;
