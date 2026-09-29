/**
 * Строка состава заказа для `OrderLineList`: цена единицы уже в валюте заказа.
 *
 * Отдельно от компонента, потому что читают его двое — сам список и тот, кто собирает ему
 * строки: карточка заказа и подтверждение оформления у стойки.
 */
export type OrderLineListItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
};
