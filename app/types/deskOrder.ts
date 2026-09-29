/**
 * Типы оформления заказа у стойки (issue #294).
 *
 * Лежат отдельно от компонентов, потому что читают их трое — composable, организм и страница, —
 * а `<script setup>` типов наружу не отдаёт.
 */

/** Водитель, выбранный на первом шаге. */
export type DeskCustomer = {
  personId: string;
  name: string;
  callsign: string | null;
  isMember: boolean;
  isDemo: boolean;
  /** Пусто — счёта нет, и за баллы оформить нельзя. */
  balance: number | null;
};

/** Товар, предложенный в выбранном способе оплаты: цена уже в его валюте. */
export type DeskOfferedProduct = {
  productId: string;
  name: string;
  unitPrice: number;
  available: number;
};
