import {
  PhotoTooLargeError,
  PhotoTypeNotAllowedError,
  UnknownProductError,
} from '#server/services/products/errors';
import { saveProductPhoto } from '#server/services/products/saveProductPhoto';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import { MAX_PHOTO_MB } from '#shared/photo';
import type { ProductResponse } from '#shared/types/catalog';

// Фото товара: `multipart/form-data`, одно поле с файлом.
//
// Отказы здесь — свои строки, а не коды из словаря: словарь покрывает дверь — кто вошёл
// и что ему открыто, — а неподходящий файл про дверь ничего не говорит, он про предмет
// разговора (docs/decisions.md → «Отказ двери веба говорит кодом, а текст живёт словарём»).
// Так же отвечает выпуск приглашения на «роль не ниже своей».
//
// До этих отказов доходит обойдённый или кривой клиент: в форме стоят `accept` и проверка
// размера при выборе файла, и человек видит ограничение рядом с полем, а не в ответе сервера
// (docs/frontend.md → «Обязательное поле — свойство поля»).
export default defineEventHandler(async (event): Promise<ProductResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  const productId = requireUuidParam(event, 'productId');
  const parts = await readMultipartFormData(event);

  // Файлом считается часть с именем файла: у текстового поля формы его нет. Имя поля
  // не проверяется — форму собирает наша же разметка, а частей с файлом в ней одна.
  const file = parts?.find((part) => part.filename !== undefined && part.data.byteLength > 0);

  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'в запросе нет файла фото',
    });
  }

  try {
    return {
      product: await saveProductPhoto({
        productId,
        contentType: (file.type ?? '').toLowerCase(),
        bytes: file.data,
      }),
    };
  } catch (error) {
    // 415, а не 400: тело разобрано и понято, не принимается именно его тип.
    if (error instanceof PhotoTypeNotAllowedError) {
      throw createError({
        statusCode: 415,
        statusMessage: 'Unsupported Media Type',
        message: 'фото принимается в JPEG, PNG или WebP',
      });
    }

    // 413 — ровно то, что этот отказ означает: файл понят, но велик.
    if (error instanceof PhotoTooLargeError) {
      throw createError({
        statusCode: 413,
        statusMessage: 'Content Too Large',
        message: `фото должно быть не больше ${MAX_PHOTO_MB} МБ`,
      });
    }

    if (error instanceof UnknownProductError) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        message: 'товара с таким идентификатором нет',
      });
    }

    throw error;
  }
});
