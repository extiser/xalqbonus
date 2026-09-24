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

/**
 * Офис карточкой — «Где забрать» на экране заказа и списки офисов при регистрации: всё,
 * чтобы доехать. Имя пишется «Офис · Кадышева»: подпись ставит фронт, имя приходит из базы.
 */
export interface MemberOfficeView {
  /** Подпись перед именем на языке водителя: «Офис». */
  label: string;
  /** Имя офиса из базы: «Кадышева». */
  name: string;
  address: string;
  /** Часы работы. Нет — строки нет. */
  hours: string | null;
  /** Телефон офиса. Нет — строки нет. */
  phone: string | null;
  /** Ссылка на карту. Нет — строки «Открыть в Яндекс Картах» нет. */
  mapUrl: string | null;
}

/** Строка под кнопкой номера: «Проверяем…» серым или сбой алым. */
export interface MemberPhoneSendStatus {
  /** `checking` — идёт проверка; `failed` — проверка не прошла. */
  tone: 'checking' | 'failed';
  text: string;
}

/** Номер, с которым пришёл водитель: как показать и что положить в буфер. */
export interface MemberPhoneView {
  /** «+998 90 123-45-67». */
  display: string;
  /** «+998901234567». */
  copy: string;
}

/** «Покажите менеджеру» на отказах регистрации: подписи, номер и Telegram ID. */
export interface MemberManagerIdsView {
  texts: {
    title: string;
    phoneLabel: string;
    telegramIdLabel: string;
    /** Подписи кнопок копирования для экранного чтеца: на экране слов нет. */
    copyPhone: string;
    copyTelegramId: string;
  };
  phone: MemberPhoneView;
  telegramId: string;
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

/** Ступень накала экрана участника: холодно, гранат, огонь — от взятых за день поездок. */
export type MemberHeatStage = 1 | 2 | 3;

/** Клетка дня в неделе акции. */
export interface MemberWeekDayView {
  id: string;
  /** День недели капсом в клетке: «чт». */
  weekday: string;
  /** Число месяца: «1». */
  day: string;
  /**
   * `done` — день зачтён, пять поездок взяты; `short` — выезжал и не добрал;
   * `future` — день ещё не наступил или сегодня без поездок.
   */
  state: 'done' | 'short' | 'future';
  /** Сегодняшний: обводка гранатом. Зачтённый сегодня остаётся и сегодняшним. */
  today: boolean;
  /** Доля взятых поездок от пяти — высота заливки, 0…1. */
  fill: number;
  /** Счёт в недобранном дне: «3/5». */
  tally?: string;
}

/** Строка сундука на экране участника. */
export interface MemberChestRowView {
  id: string;
  kind: MemberChestKind;
  /** Картинка: закрыт с замком, приоткрыт — ждёт открытия, распахнут. */
  image: 'closed' | 'ajar' | 'open';
  name: string;
  condition: string;
  /** Сколько собрано — справа, когда открывать нечего. */
  count?: string;
  /**
   * `idle` — ещё не ваш; `hot` — есть что открыть, золото; `mine` — ваш, гранатовой рамкой;
   * `cold` — уже не набрать: гаснет, но остаётся на месте.
   */
  state: 'idle' | 'hot' | 'mine' | 'cold';
  /** Главный приз недели — имя золотом. */
  prize: boolean;
}

/** Ступень карточки награды — металл: у сундука дня по редкости, у крупных одна. */
export type MemberRewardTier = 'steel' | 'bronze' | 'silver' | 'gold';

/** Что написано на карточке награды, вылетающей из сундука. */
export interface MemberRewardTicketView {
  tier: MemberRewardTier;
  /** Корешок — какой сундук: «Сундук дня». */
  stub: string;
  /** Сумма: «+36 баллов». */
  title: string;
  /** Подпись: «уже на балансе». */
  subtitle: string;
}

/** Карточка дня в шторке «Сундуки дня». */
export interface MemberChestCardView {
  id: string;
  /**
   * `cold` — впереди; `today` — сегодняшний, ещё решается; `lost` — день прошёл без цели;
   * `hot` — сундук ваш и ждёт открытия; `open` — открыт.
   */
  state: 'cold' | 'today' | 'lost' | 'hot' | 'open';
  /** Ярлык сверху: «сегодня», «3 из 5». */
  tag?: string;
  /** Подпись снизу: «впереди», «открыть», «упущен». */
  label: string;
  /** Доля взятых поездок — стакан у сегодняшнего, 0…1. */
  fill?: number;
}
