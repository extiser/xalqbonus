import { listDeskProducts } from '#server/repositories/stock';
import { requireOpenOffice, type OfficeWorker } from '#server/services/offices/employeeOffices';
import type { DeskProductsResponse } from '#shared/types/orders';

/**
 * Товары офиса для оформления заказа у стойки (issue #294).
 *
 * Офис — правилом офисов, как у любой ручки стойки: менеджеру только его, чужой —
 * `OfficeNotOpenError`. Архивный офис отвечает пустым списком: заказов он не принимает,
 * и оформлять в нём нечего. Сторона демо — стороной сотрудника: правило офисов отдаёт ему
 * офисы только своей стороны.
 *
 * Розничная цена ноль отдаётся пустой: у опубликованного товара колонка заполнена всегда
 * (`products_published_complete_check`), и ноль в ней — «за розницу не продаётся», тем же
 * правилом, что у `placeDeskOrder`.
 */
export const readDeskProducts = async (
  worker: OfficeWorker,
  officeId: string,
): Promise<DeskProductsResponse> => {
  const office = await requireOpenOffice(worker, officeId);

  if (office.archived) {
    return { products: [] };
  }

  const rows = await listDeskProducts(officeId, worker.isDemo);

  return {
    products: rows.map((row) => ({
      productId: row.productId,
      name: row.name,
      pricePoints: row.pricePoints,
      priceRetail: row.priceRetail > 0 ? row.priceRetail : null,
      available: row.available,
    })),
  };
};
