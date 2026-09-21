/**
 * Контракт ручек сегментов (issue #165).
 *
 * Типы лежат в `shared/`, потому что у них два потребителя — обработчик и разметка.
 * Времена уезжают строками ISO-8601, незаполненное поле — `null`.
 */

/**
 * Условия отбора. `null` — условие не задано и в отбор не входит вовсе. Склейка только «и».
 *
 * Хотя бы одно задано всегда: сегмент без условий — это весь реестр парка под видом среза
 * (`shared/segment.ts` → `hasSegmentConditions`, в базе — `segments_has_condition_check`).
 */
export type SegmentConditions = {
  /**
   * Сутки парка с последней завершённой поездки — не меньше. Задана любая из двух границ —
   * человек без единой завершённой поездки в состав не входит: «не ездил» — не «давно ездил».
   */
  daysSinceTripMin: number | null;
  /** Сутки парка с последней завершённой поездки — не больше. */
  daysSinceTripMax: number | null;
  /** `true` — только участники программы, `false` — только не участники. */
  programMember: boolean | null;
  /** `true` — только с активной привязкой Telegram, `false` — только без неё. */
  telegramLinked: boolean | null;
  /** Баланс водительского счёта — не меньше. Без счёта человек под условие не подходит. */
  balanceMin: number | null;
  /** Баланс водительского счёта — не больше. */
  balanceMax: number | null;
};

export type Segment = {
  segmentId: string;
  name: string;
  /** Для сотрудников: зачем срез и кого он должен брать. */
  description: string | null;
  conditions: SegmentConditions;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** Заполнено — сегмент в архиве: при выборе не предлагается, по ссылке открывается. */
  archivedAt: string | null;
};

/** Сегмент в списке — с числом водителей на момент ответа. */
export type SegmentListItem = Segment & {
  total: number;
};

export type SegmentListResponse = {
  segments: SegmentListItem[];
  /** Когда посчитаны числа списка. */
  calculatedAt: string;
};

export type SegmentResponse = {
  segment: Segment;
};

/**
 * Тело заведения и правки сегмента — форма целиком. Пустое описание приходит пустой строкой:
 * «пусто значит не задано» решает сервер.
 */
export type SegmentRequestBody = {
  name: string;
  description: string;
  conditions: SegmentConditions;
};

/** Тело предпросмотра несохранённых условий. */
export type SegmentPreviewRequestBody = {
  conditions: SegmentConditions;
  offset: number;
};

/**
 * Строка состава. Давность и привязка — не для красоты: по колонке с давностью видно
 * за секунду, что отбор взял заданные границы, а не соседние.
 */
export type SegmentMember = {
  personId: string;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  callsigns: string[];
  /** Пусто — водительского счёта нет, а не ноль на нём. */
  balance: number | null;
  /** Сутки парка с последней завершённой поездки. Пусто — завершённых поездок не было. */
  daysSinceTrip: number | null;
  telegramLinked: boolean;
};

export type SegmentPreviewResponse = {
  total: number;
  rows: SegmentMember[];
  limit: number;
  offset: number;
  /** Момент, от которого считались сутки и балансы: состав на сейчас, а не навсегда. */
  calculatedAt: string;
};
