import { existsSync } from 'node:fs';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  deleteProductPhoto,
  resolveProductPhotoFile,
} from '#server/adapters/uploads/productPhotos';
import { db } from '#server/db';
import { writeStockMovement } from '#server/repositories/stock';
import { ProductUnavailableError } from '#server/services/orders/errors';
import { placeOrder } from '#server/services/orders/placeOrder';
import { createProduct } from '#server/services/products/createProduct';
import { deleteProductDraft } from '#server/services/products/deleteProductDraft';
import {
  ProductDraftError,
  ProductIncompleteError,
  ProductNotDraftError,
  UnknownProductError,
} from '#server/services/products/errors';
import { publishProduct } from '#server/services/products/publishProduct';
import { readOfficeShowcase } from '#server/services/products/readOfficeShowcase';
import { readProduct } from '#server/services/products/readProduct';
import { readProductList } from '#server/services/products/readProductList';
import { saveProductPhoto } from '#server/services/products/saveProductPhoto';
import { setProductArchived } from '#server/services/products/setProductArchived';
import { updateProduct } from '#server/services/products/updateProduct';
import { UnknownStockTargetError } from '#server/services/stock/errors';
import { readOfficeStock } from '#server/services/stock/readOfficeStock';
import { receiveStock } from '#server/services/stock/receiveStock';
import {
  cleanupTestData,
  createTestOffice,
  createTestPerson,
  disconnectDatabase,
  trackTestProduct,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { grantPoints } from '../support/points';

/**
 * Черновик товара (issue #148): заводится пустым, публикуется только полным, водителю
 * не виден нигде и удаляется вместе с фото.
 *
 * Запросы здесь сырые, и типы расхождения с базой не ловят (docs/infra.md → «Тесты», третье
 * исключение): тест гоняет их через сервисы — тем путём, которым их зовут ручки. Отсечение
 * черновика проверяется в выборке каталога — витрине, заказе и остатках, — а не на экране.
 */

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const EMPTY = {
  name: null,
  description: null,
  pricePoints: null,
  priceRetail: null,
  priceCost: null,
  promo: false,
  hiddenInCatalog: false,
};

const COMPLETE = {
  name: 'Тряпка для кузова',
  description: null,
  pricePoints: 40,
  priceRetail: 40_000,
  priceCost: 30_000,
  promo: false,
  hiddenInCatalog: false,
};

const createDraft = async (fields: typeof EMPTY | typeof COMPLETE = EMPTY) => {
  const product = await createProduct(fields);

  trackTestProduct(product.productId);

  return product;
};

describe('черновик товара', () => {
  afterEach(async () => {
    await cleanupTestData();
    await cleanupTestEmployees();
  });
  afterAll(disconnectDatabase);

  it('заводится пустым и публикуется только полным, называя все причины сразу', async () => {
    const draft = await createDraft();

    expect(draft).toEqual(
      expect.objectContaining({ name: null, pricePoints: null, publishedAt: null, archivedAt: null }),
    );

    await expect(publishProduct(draft.productId)).rejects.toMatchObject({
      problems: ['missing_name', 'missing_price_points', 'missing_price_retail', 'missing_price_cost'],
    });

    await updateProduct(draft.productId, { ...EMPTY, name: 'Тряпка', pricePoints: 40 });

    await expect(publishProduct(draft.productId)).rejects.toMatchObject({
      problems: ['missing_price_retail', 'missing_price_cost'],
    });

    // Черновик в списке сотрудника виден и помечен отсутствием отметки публикации.
    const listed = (await readProductList()).products.find(
      (product) => product.productId === draft.productId,
    );

    expect(listed?.publishedAt).toBeNull();

    // Архивировать черновик нечего — его удаляют.
    await expect(setProductArchived(draft.productId, true)).rejects.toBeInstanceOf(
      ProductDraftError,
    );

    await updateProduct(draft.productId, COMPLETE);

    const published = await publishProduct(draft.productId);

    expect(published.publishedAt).not.toBeNull();

    // Повтор публикации отметку не двигает.
    expect((await publishProduct(draft.productId)).publishedAt).toBe(published.publishedAt);

    // Опубликованный обязательных полей правкой не теряет — ни в сервисе, ни в базе.
    await expect(
      updateProduct(draft.productId, { ...COMPLETE, priceCost: null }),
    ).rejects.toBeInstanceOf(ProductIncompleteError);
    expect((await readProduct(draft.productId))?.priceCost).toBe(COMPLETE.priceCost);

    // Архивация опубликованного — как раньше.
    expect((await setProductArchived(draft.productId, true)).archivedAt).not.toBeNull();
  });

  it('водителю не виден: витрина, заказ и остатки офиса черновик отсекают', async () => {
    const person = await createTestPerson({ inProgram: true });
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const draft = await createDraft(COMPLETE);

    await grantPoints(person.personId, 100);

    // В офис черновик не принимается — на него не должен ссылаться журнал остатков.
    await expect(
      receiveStock({ officeId, productId: draft.productId, quantity: 5, employeeId }),
    ).rejects.toBeInstanceOf(UnknownStockTargetError);

    const stock = await readOfficeStock(officeId);

    expect(stock?.rows.map((row) => row.productId)).not.toContain(draft.productId);

    // Даже с остатком на полке — положенным мимо сервиса — черновик отсекается выборкой.
    await db.$transaction((transaction) =>
      writeStockMovement(transaction, {
        officeId,
        productId: draft.productId,
        kind: 'incoming',
        deltaOnHand: 5,
        deltaReserved: 0,
        employeeId,
      }),
    );

    const showcase = await readOfficeShowcase({ officeId, balance: 100n });

    expect(showcase?.products.map((product) => product.productId)).not.toContain(draft.productId);

    await expect(
      placeOrder({
        personId: person.personId,
        officeId,
        items: [{ productId: draft.productId, quantity: 1 }],
        actor: 'mini_app',
      }),
    ).rejects.toBeInstanceOf(ProductUnavailableError);

    // Опубликованный с тем же остатком виден и заказывается.
    await publishProduct(draft.productId);

    const published = await readOfficeShowcase({ officeId, balance: 100n });

    expect(published?.products.map((product) => product.productId)).toContain(draft.productId);
  });

  it('удаляется вместе с файлом фото, а опубликованный — нет', async () => {
    const draft = await createDraft();

    const photographed = await saveProductPhoto({
      productId: draft.productId,
      contentType: 'image/png',
      bytes: PNG_BYTES,
    });
    const file = resolveProductPhotoFile((photographed.photoPath ?? '').split('/').pop() ?? '') ?? '';

    expect(existsSync(file)).toBe(true);

    await deleteProductDraft(draft.productId);

    expect(existsSync(file)).toBe(false);
    expect(await readProduct(draft.productId)).toBeNull();
    await expect(deleteProductDraft(draft.productId)).rejects.toBeInstanceOf(UnknownProductError);

    const kept = await createDraft(COMPLETE);
    const withPhoto = await saveProductPhoto({
      productId: kept.productId,
      contentType: 'image/png',
      bytes: PNG_BYTES,
    });

    await publishProduct(kept.productId);

    await expect(deleteProductDraft(kept.productId)).rejects.toBeInstanceOf(ProductNotDraftError);
    expect(await readProduct(kept.productId)).not.toBeNull();

    // Файл убирается за тестом: товар опубликован, и сервис его не снимет.
    await deleteProductPhoto(withPhoto.photoPath ?? '');
  });
});
