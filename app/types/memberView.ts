/**
 * Что принимают новые компоненты водительского Mini App (`components/{atoms,molecules,organisms}/next/`).
 *
 * Всё приходит готовыми строками на языке водителя: даты, суммы, подписи. Компонент
 * ничего не форматирует и не переводит — он рисует. Цвет строки компонент выбирает сам
 * по состоянию (`status`), а не получает с данными: цвет — вид, а вид принадлежит компоненту.
 *
 * Пока компоненты живут на служебной странице `/design`, эти данные приходят из заглушек
 * (`app/design/mocks.ts`). Откуда их возьмёт рабочий экран — решает задача подключения.
 */

/** Состояние загрузки блока или раздела, которое компонент умеет нарисовать. */
export type MemberViewLoad = 'ready' | 'loading' | 'empty' | 'error';

/** Операция со счётом — строка истории баллов. */
export interface MemberOperationView {
  id: string;
  /** Время операции, «14:26». */
  time: string;
  /** Что произошло словами водителя, «Обмен на товар · #1042». */
  title: string;
  /** Сумма со знаком, «+1», «−900». */
  amount: string;
  /** Начисление или списание: от этого цвет суммы. */
  direction: 'plus' | 'minus';
}

/** День истории: подпись («Сегодня», «14 сентября») и операции за него. */
export interface MemberOperationDayView {
  id: string;
  label: string;
  operations: MemberOperationView[];
}

export type MemberOrderStatus = 'pending' | 'issued' | 'cancelled';

/** Заказ строкой — в списке раздела и компактной карточкой на главной. */
export interface MemberOrderRowView {
  id: string;
  /** «Заказ № 1042». */
  title: string;
  status: MemberOrderStatus;
  /** Слово состояния: «Ждёт выдачи», «Выдан», «Отменён». */
  state: string;
  /** Уточнение после точки: срок, дата, на главной ещё и офис. */
  hint?: string;
  /** Причина отмены отдельной строкой: «Вы отменили заказ». */
  reason?: string;
  /** Сумма, «900 баллов». На главной не показывается. */
  amount?: string;
  /** Подпись под суммой: «списано со счёта», «вернулось на счёт». */
  amountCaption?: string;
  /** Офис строкой «Офис · Чиланзар». У отменённого нет. */
  office?: string;
  /** Строка-действие внизу: «Код для выдачи — внутри», «Просмотреть». */
  actionLabel?: string;
}

export type MemberRewardStatus = 'awaiting' | 'credited' | 'issued' | 'expired';

/** Награда — в разделе полной карточкой и на главной компактной. */
export interface MemberRewardView {
  id: string;
  /** Что за награда: «Шашка Taxi», «300 баллов». */
  title: string;
  status: MemberRewardStatus;
  /** Откуда: «Акция „Неделя возвращения“ · сундук недели». */
  origin?: string;
  /** Состояние словами: «Ждёт в офисе до 5 октября». */
  state: string;
  /** Уточнение после точки — только на главной: «код внутри». */
  hint?: string;
  /** Офис с адресом. */
  office?: string;
  /** Код выдачи — только у ждущей. */
  code?: string;
}

/** Офис на экране заказа: всё, чтобы доехать. */
export interface MemberOfficeView {
  /** «Офис · Чиланзар». */
  name: string;
  address: string;
  hours: string;
  phone: string;
}

/** Позиция в составе заказа. */
export interface MemberOrderLineView {
  id: string;
  title: string;
  /** Количество и цена под названием: «2 шт. · 150 баллов за штуку». */
  detail: string;
  cost: string;
}

/** Заказ целиком — экран заказа. */
export interface MemberOrderDetailView {
  title: string;
  status: MemberOrderStatus;
  state: string;
  hint?: string;
  reason?: string;
  amount: string;
  amountCaption?: string;
  /** Офис строкой в карточке закрытого заказа — у выданного. */
  office?: string;
  /** Код выдачи — только у висящего. */
  code?: string;
  /** Карточка офиса — только у висящего: дорога нужна, пока заказ жив. */
  officeCard?: MemberOfficeView;
  lines: MemberOrderLineView[];
  total: string;
  /** Можно ли отменить: у закрытого кнопки нет. */
  cancellable: boolean;
}

/** Поле профиля: подпись и значение. */
export interface MemberProfileFieldView {
  id: string;
  label: string;
  value: string;
  /** Значения нет — пишется серым, а не алым: это не ошибка. */
  missing?: boolean;
}

export type MemberLanguage = 'ru' | 'uz';

/** Вариант языка в шторке — название на самом языке. */
export interface MemberLanguageOptionView {
  language: MemberLanguage;
  label: string;
}

/** Сундук акции — какой картинкой он рисуется. */
export type MemberChestKind = 'day' | '3days' | 'week';

/**
 * Кусок строки с выделением — правила акции пишутся фразой, где часть слов жирная
 * или золотая. `plain` — обычный текст правила, `action` — действие водителя,
 * `strong` — число и срок, `gold` — название сундука.
 */
export interface MemberTextPart {
  text: string;
  emphasis: 'plain' | 'action' | 'strong' | 'gold';
}

/** Строка правила акции на экране приглашения: сундук и фраза в несколько строк. */
export interface MemberPromoRuleView {
  id: string;
  chest: MemberChestKind;
  /** Главная награда недели — золотой подсветкой. */
  highlighted: boolean;
  lines: MemberTextPart[][];
}
