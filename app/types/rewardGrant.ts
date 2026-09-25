/**
 * Типы раздела «Награды» (issue #219).
 *
 * Лежат отдельно от компонентов, потому что читают их двое — компонент и страница, — а
 * `<script setup>` типов наружу не отдаёт.
 */

/** Водитель, выбранный получателем: из поиска или из адреса `/rewards?personId=…`. */
export type PickedDriver = {
  personId: string;
  name: string;
  isMember: boolean;
};

/** Поля подарка-баллов, как их набрали в форме. */
export type GiftFields = {
  points: string;
  reasonRu: string;
  reasonUz: string;
  /** «Забрать до», `YYYY-MM-DD`. */
  untilDate: string;
  /** Обложка. Пусто — без обложки. */
  cover: File | null;
};
