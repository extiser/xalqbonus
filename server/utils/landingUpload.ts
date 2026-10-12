import { readMultipartFormData, type H3Event } from 'h3';

/**
 * Поля формы загрузки лендинга (issue #478) — `multipart/form-data`: `name` текстом и `file`
 * архивом. Что из них годится, решает сервис; здесь только разбор запроса.
 */
export type LandingUpload = {
  /** Текст поля `name`; поля нет — `undefined`. */
  name: string | undefined;
  /** Байты поля `file`; файла нет или он пустой — `null`. */
  archive: Uint8Array | null;
};

export const readLandingUpload = async (event: H3Event): Promise<LandingUpload> => {
  const parts = (await readMultipartFormData(event)) ?? [];
  const namePart = parts.find((part) => part.name === 'name' && part.filename === undefined);
  const filePart = parts.find((part) => part.name === 'file' && part.data.byteLength > 0);

  return {
    name: namePart?.data.toString('utf8'),
    archive: filePart ? new Uint8Array(filePart.data) : null,
  };
};
