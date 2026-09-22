/**
 * Контракт водительского Mini App: что отдают ручки `server/api/miniapp/` и что принимает
 * страница `/app`.
 *
 * Типы лежат в `shared/`, потому что у них два потребителя — обработчик и разметка,
 * и второе описание тех же полей разошлось бы с первым на ближайшей правке.
 *
 * **Тексты приезжают с сервера готовыми строками.** Они живут одним словарём
 * в `server/bot/texts.ts`, и второе место, где написано то же самое по-узбекски, устарело
 * бы на первой правке — ровно как таблица переводов старого бота, где у 223 строк из 236
 * узбекский побайтово равнялся русскому.
 */

// Словарь берётся у Prisma, а не переписывается здесь строковым объединением: это наше
// перечисление, оно меняется нашей же миграцией. Импорт только типов — в сборку
// не попадает ни байта.
import type {
  CampaignChestKind,
  CampaignParticipantOutcome,
  CampaignParticipantState,
  EmployeeRole,
  Language,
  LinkAttemptOutcome,
  OrderStatus,
} from '../../server/generated/prisma/enums';
import type { EmployeeOffice } from './orders';
import type { MemberRewardTexts } from './rewards';

// Разметке язык нужен так же, как обработчику: на нём стоит переключатель экрана
// регистрации. Пробрасывается отсюда, чтобы страница не лазила в каталог Prisma
// относительным путём мимо `#shared`.
export type { Language };

/**
 * Заголовок, которым Mini App передаёт `initData` на каждом запросе.
 *
 * Единственное значение в этом файле: имя заголовка знают обе стороны, и разошедшись,
 * они разойдутся молча — запрос просто окажется без личности. Своим заголовком, а не полем
 * тела и не параметром адреса: строка нужна каждой ручке независимо от метода, а в адресе
 * она попадала бы в логи прокси целиком, вместе с подписью.
 */
export const INIT_DATA_HEADER = 'x-telegram-init-data';

/** Офис парка: куда идти, когда автоматика не справилась. */
export type OfficeContact = {
  name: string;
  /** Режим работы. Показывается всегда: у ТТЗ он не круглосуточный. */
  hours: string;
  phone: string;
  /** Ссылка на карту. Открывается наружу, поэтому строкой, а не координатами. */
  mapUrl: string;
};

/** Тексты экрана регистрации на одном языке. */
export type RegistrationScreenTexts = {
  selectLanguage: string;
  languageRu: string;
  languageUz: string;
  askPhone: string;
  sendPhone: string;
  /** Пока запрос в пути. Поход в Fleet API занимает секунды. */
  checkingPhone: string;
  /**
   * Клиент старее Bot API 6.9: вызова `requestContact` в нём нет, и номер внутри приложения
   * взять нечем. Приезжает вместе с остальными текстами, а не лежит на клиенте: к моменту,
   * когда он понадобится, язык водителя уже выбран, и говорить с ним на двух сразу незачем.
   */
  outdatedClient: string;
};

/** Тексты экрана участника на его языке. */
export type MemberScreenTexts = {
  /** Подпись над крупным числом баланса. */
  balanceTitle: string;
  /** Операций нет ни одной. Пустой список без подписи читается как поломка. */
  historyEmpty: string;
  /** Страница истории не прочиталась. Это отказ запроса, а не пустая история. */
  historyFailed: string;
  showMore: string;
  /**
   * Кнопка обновления рядом со строкой «Данные обновлены». На экране она значок, поэтому
   * текст уходит в имя кнопки: без него экранный диктор прочтёт кнопку без названия.
   */
  refresh: string;
};

/**
 * Одна строка истории, какой её видит водитель: когда, за что и на сколько.
 *
 * Ни второй стороны перевода, ни ключа идемпотентности, ни номера заказа такси: это состав
 * для сотрудника, разбирающего спор, а не для водителя (issue #101). Номер заказа такси
 * водителю ни о чём не говорит, а разбор конкретной поездки идёт через офис.
 *
 * Номер **нашего** заказа за баллы — другое дело: его водитель видел на экране и называл
 * на стойке. У списания и возврата он стоит в подписи причины (issue #121).
 *
 * Тексты — готовыми строками на языке водителя. День и время считает сервер, в зоне парка:
 * телефон в поездке бывает в чужой зоне, а спор у стойки идёт про ташкентские сутки.
 */
export type MemberOperation = {
  /** Строка журнала — ключ списка. Число `bigint`, поэтому текстом. */
  id: string;
  /** День операции, `YYYY-MM-DD` в зоне парка. На его смене экран ставит разделитель. */
  day: string;
  /** Подпись дня: «Сегодня», «Вчера» или дата. */
  dayLabel: string;
  /** Время операции, `14:32`. */
  time: string;
  /** Причина человеческим языком. */
  reason: string;
  /** Изменение баланса со знаком. Знак решает, как строка выглядит и что означает. */
  delta: number;
};

/**
 * Страница истории.
 *
 * Всего операций наружу не уходит: водителю это число ничего не решает, а листание
 * кнопкой «Показать ещё» спрашивает у страницы ровно одно — есть ли следующая.
 *
 * Следующая берётся меткой последней показанной строки, а не её порядковым номером:
 * прогон заказов, приехавший между двумя нажатиями, сдвинул бы нумерацию и показал
 * водителю одну поездку дважды.
 */
export type MiniAppHistoryResponse = {
  operations: MemberOperation[];
  /** Метка следующей страницы — назад в ручку как есть. `null` — показано всё. */
  nextCursor: string | null;
};

/** Отметка, до какого момента учтены поездки. */
export type TripsNote = {
  /** Готовая строка: дата и время прогона, или «данные ещё не поступали», если его не было. */
  text: string;
  /**
   * Последний успешный прогон старше суток. Строка тогда предупреждение, а не подпись:
   * водитель в этом состоянии прав, что баллы «не приходят» (issue #133).
   */
  stale: boolean;
};

/**
 * Что показать открывшему приложение.
 *
 * Участник узнаётся по активной строке в `telegram_links`, и экран регистрации ему
 * не показывается вовсе: у перенесённого из старой базы номер не спрашивается ни разу.
 */
export type MiniAppMemberScreen = {
  screen: 'member';
  /** Язык участника из `person_settings` — тот, который он однажды уже выбрал. */
  language: Language;
  /** Имя из учётки парка — то же, которым с водителем здоровается бот. */
  name: string;
  /** Баланс со счёта, разряды разделены. Строкой: показывается, а не считается. */
  balance: string;
  /**
   * «Поездки учтены до 14.09.2026, 14:32» — время последнего **успешного** прогона заказов.
   *
   * Когда успешных прогонов не было ни одного — «Данные о поездках ещё не поступали».
   * Время неудачной попытки в роли отметки — это ровно то враньё, от которого
   * экран и заводится.
   */
  tripsNote: TripsNote;
  /**
   * Обещание 300 баллов за первые пять поездок. Пусто у того, у кого поездки уже есть:
   * перенесённому из старой базы с тысячей поездок обещать первые пять незачем.
   */
  promise: string | null;
  texts: MemberScreenTexts;
  /**
   * Тексты витрины и заказа. Приезжают с экраном участника, а не с каждой ручкой витрины:
   * экраны переключаются без перезагрузки, и язык у них тот же, что у экрана участника.
   */
  orderTexts: MemberOrderTexts;
  /** Тексты раздела «Мои награды» (issue #172) — тем же приёмом, что тексты заказов. */
  rewardTexts: MemberRewardTexts;
};

/**
 * Акция, какой её видит водитель (issue #166). Рабочий минимум: название, сроки, состояние
 * строкой и два действия. Оформление по макетам — своей задачей.
 *
 * Тексты — готовыми строками на языке водителя, как весь экран участника.
 */
export type MemberCampaign = {
  /** Название акции — одно, для людей. */
  title: string;
  /** «Сроки акции: 01.10.2026 — 07.10.2026» — первый и последний день окна его половины. */
  window: string;
  state: CampaignParticipantState;
  /** Состояние словами. */
  stateText: string;
  /**
   * Можно ли ещё вступить или отказаться. Ложь у вступившего и отказавшегося: назад
   * состояния не ходят, и кнопка, которая ничего не меняет, звала бы в пустое действие.
   */
  canRespond: boolean;
  joinLabel: string;
  declineLabel: string;
  /**
   * Прогресс недели (issue #168). `null` — вступления нет: считать не от чего, и чисел
   * у приглашённого, открывшего экран и отказавшегося нет вовсе, а не нули.
   */
  progress: MemberCampaignProgress | null;
};

/** Вид строки блока недели: золото, серый или белый — выбирает сервер, экран только красит. */
export type MemberWeekLineTone = 'gold' | 'grey' | 'white';

export type MemberWeekLine = {
  text: string;
  tone: MemberWeekLineTone;
};

/** Клетка дня окна. */
export type MemberWeekDay = {
  /** Номер дня окна, с единицы. */
  day: number;
  /** Сутки парка, `YYYY-MM-DD`. */
  date: string;
  /** Зачитанных поездок в этот день — завершённых после вступления. У будущего дня ноль. */
  trips: number;
  /** День зачтён: поездок пять или больше. */
  qualified: boolean;
  kind: 'past' | 'today' | 'future';
};

/**
 * Блок дневной цели. Ступень нагрева — 1 (0–1 поездка), 2 (2–3), 3 (4 и больше): три,
 * а не шесть, чтобы экран не дёргался на каждой поездке.
 */
export type MemberCampaignToday = {
  trips: number;
  /** Сколько осталось до пяти; ноль — цель взята. */
  tripsLeft: number;
  goalTaken: boolean;
  heatStep: 1 | 2 | 3;
  /** «Сегодня 3 поездки». */
  tripsText: string;
  /** «Сундук дня ждёт: всего 2 поездки» или «Ура! Сундук дня ваш!». */
  goalText: string;
};

/**
 * Числа недели участника. Пока окно идёт, считаются от журнала при каждом показе; когда
 * исход проставлен — `frozen`, и всё рисуется из снимка итога, сколько бы поездок ни доехало.
 */
export type MemberCampaignProgress = {
  /** Номер сегодняшнего дня окна. У замершей недели — последний день окна. */
  day: number;
  /** Дней в окне. */
  windowDays: number;
  /** «День 3 из 7». */
  dayText: string;
  days: MemberWeekDay[];
  /** Зачётных дней, зажато на пятёрке. */
  done: number;
  need: number;
  slack: number;
  chestDays: number;
  /** Дневная цель. `null` у замершей недели: сегодняшнего дня в окне уже нет. */
  today: MemberCampaignToday | null;
  /** Верхняя строка справа. `null` — строки нет. */
  weekTop: MemberWeekLine | null;
  /** «2 из 5 дней» — слева в нижней строке. */
  counterText: string;
  /** Нижняя строка справа. `null` у замершей недели: правила для идущего окна там не работают. */
  weekBottom: MemberWeekLine | null;
  frozen: boolean;
  outcome: CampaignParticipantOutcome | null;
  /** Лестница сундуков (issue #181). */
  chests: MemberChestLadder;
};

/** Состояние ступени трёх дней или недели. */
export type MemberChestStepState = 'reachable' | 'to_open' | 'opened' | 'unreachable';

/** Состояние карточки сундука дня. «Сегодня» с взятой целью приходит уже как `to_open`. */
export type MemberDayChestState = 'ahead' | 'today' | 'to_open' | 'opened' | 'missed';

/** Карточка сундука дня. */
export type MemberDayChest = {
  /** Номер дня окна, с единицы. */
  day: number;
  state: MemberDayChestState;
  /** Зачитанных поездок в этот день. */
  trips: number;
  /** Подпись карточки: «впереди», «3 из 5», «открыть», «открыт», «упущен». */
  label: string;
  /** Счёт «3 из 5» над ярлыком — только у упущенного: у сегодняшнего он и есть ярлык. */
  tripsText: string | null;
  /** Что выпало. Только у открытого. */
  prizeText: string | null;
};

/** Сундук трёх дней или недели — одна строка лестницы. */
export type MemberChestStep = {
  kind: 'three_days' | 'week';
  state: MemberChestStepState;
  /** Порог ступени — зачётных дней. */
  required: number;
  /** Сколько зачётных дней ещё нужно. Ноль — заработана. */
  daysLeft: number;
  title: string;
  /** Подпись под названием: условие, пока с сундуком ничего не случилось, потом — состояние. */
  caption: string;
  prizeText: string | null;
};

/** Строка «Сундуки дня»: есть ли что открыть и сколько открыто. */
export type MemberDayChestRow = {
  state: 'idle' | 'to_open' | 'opened';
  title: string;
  caption: string;
  toOpen: number;
  opened: number;
};

export type MemberChestLadder = {
  dayRow: MemberDayChestRow;
  /** Карточка на каждый день окна, в порядке дней. */
  days: MemberDayChest[];
  threeDays: MemberChestStep;
  week: MemberChestStep;
};

/** Тело открытия сундука. Номер дня — только у сундука дня. */
export type MiniAppOpenChestRequestBody = {
  kind: CampaignChestKind;
  day: number | null;
};

/**
 * Ответ открытия: экран акции уже с открытым сундуком и что выпало. Повтор открытия того же
 * сундука отвечает тем же призом — ответ мог потеряться по дороге.
 */
export type MiniAppOpenChestResponse = {
  campaign: MemberCampaign | null;
  /** «Ваш приз: 50 баллов». */
  prizeText: string;
  /** Где награду посмотреть. */
  rewardsHint: string;
};

/** Почему сундук не открылся. Текст к коду — на языке водителя, в `message` отказа. */
export type MemberChestDenialCode = 'campaign_unavailable' | 'chest_not_earned' | 'prize_unavailable';

export type MemberChestDenialPayload = {
  code: MemberChestDenialCode;
};

/**
 * Что у водителя с акцией. `null` — акции для него нет: он не в составе, окно его половины
 * не началось или уже кончилось. Это обычное состояние, а не ошибка.
 */
export type MiniAppCampaignResponse = {
  campaign: MemberCampaign | null;
};

/** Тексты витрины, оформления и заказов на языке участника. */
export type MemberOrderTexts = {
  exchangePoints: string;
  myOrders: string;
  /** Кнопка «назад» на экране — только у клиента без системной кнопки Telegram. */
  back: string;
  /** Ответа не было вовсе: сказать, что случилось, сервер не мог. */
  requestFailed: string;
  officesTitle: string;
  officesEmpty: string;
  officesFailed: string;
  openMap: string;
  showcaseEmpty: string;
  showcaseFailed: string;
  noPhoto: string;
  /** Единица штук — «шт.». Число стоит рядом цифрами, без склонения. */
  pieces: string;
  /** Единица баллов — «баллов». */
  points: string;
  inStock: string;
  cartTotal: string;
  balanceAfter: string;
  checkout: string;
  checkoutNothingSelected: string;
  checkoutOverBalance: string;
  confirmTitle: string;
  confirmNote: string;
  placeOrder: string;
  editOrder: string;
  codeTitle: string;
  cancelOrder: string;
  cancelQuestion: string;
  cancelYes: string;
  cancelNo: string;
  ordersTitle: string;
  ordersEmpty: string;
  ordersFailed: string;
};

/**
 * Офис, каким его видит водитель: куда ехать и когда там открыто.
 *
 * Архивного признака нет: архивный офис водителю не показывается вовсе.
 */
export type MemberOffice = {
  officeId: string;
  name: string;
  address: string;
  workHours: string | null;
  phone: string | null;
  telegram: string | null;
  /** Ссылка на карту. Открывается наружу. */
  mapUrl: string | null;
};

export type MiniAppOfficesResponse = {
  offices: MemberOffice[];
};

/**
 * Товар витрины.
 *
 * Сумм и себестоимости здесь нет и быть не может: водителю цена — в баллах, а цена в сумах
 * — это разговор парка с поставщиком.
 */
export type ShowcaseProduct = {
  productId: string;
  name: string;
  description: string | null;
  photoPath: string | null;
  /** Версия адреса фото — см. `ProductPhoto`. */
  updatedAt: string;
  pricePoints: number;
  /** Сколько можно взять сейчас: свободный остаток этого офиса, всегда больше нуля. */
  available: number;
};

export type MiniAppShowcaseResponse = {
  office: MemberOffice;
  /**
   * Баланс числом. Экран считает по нему остаток после списания и гасит кнопку, но решает
   * всё равно сервер: между показом и оформлением баланс может измениться.
   */
  balancePoints: number;
  products: ShowcaseProduct[];
};

export type MemberOrderLine = {
  productId: string;
  name: string;
  quantity: number;
  /** Цена на момент заказа, а не текущая цена каталога. */
  unitPoints: number;
};

/**
 * Заказ, каким его видит водитель.
 *
 * Код и срок есть только у висящего: у выданного и отменённого код освобождён и может
 * принадлежать чужому заказу — показывать его незачем.
 */
export type MemberOrder = {
  orderId: string;
  number: number;
  /** «Заказ № 1042». */
  title: string;
  status: OrderStatus;
  officeName: string;
  officeAddress: string;
  totalPoints: number;
  lines: MemberOrderLine[];
  code: string | null;
  /** «Заберите до 15.09.2026 14:32». Только у висящего. */
  expiresNote: string | null;
  /** «Ждёт выдачи», «Выдан 14.09.2026 14:32», «Отменён …». */
  statusText: string;
  /** Причина отмены словами. Только у отменённого. */
  reasonText: string | null;
};

export type MiniAppOrdersResponse = {
  orders: MemberOrder[];
};

export type MiniAppOrderResponse = {
  order: MemberOrder;
};

export type MiniAppPlaceOrderRequestBody = {
  officeId: string;
  items: { productId: string; quantity: number }[];
};

/**
 * Отказ оформления и отмены — кодом.
 *
 * Код решает, что делает экран, текст к нему приходит в `message` на языке водителя.
 * Коды не придуманы в ручке: каждый — это доменная ошибка ядра заказа или журнала баллов.
 */
export type MemberOrderDenialCode =
  | 'office_unavailable'
  | 'product_unavailable'
  | 'insufficient_stock'
  | 'insufficient_points'
  | 'order_not_found'
  | 'order_not_pending';

/** Что лежит в `data` отказавшей ручки заказа. */
export type MemberOrderDenialPayload = { code: MemberOrderDenialCode };

/**
 * Экран сотрудника: выдача заказов по коду в его офисах.
 *
 * Сотрудник узнаётся по `employees.telegram_user_id` раньше водителя, и водительские ветки
 * он не проходит вовсе: одна роль на Telegram держится кодом с обеих сторон
 * (docs/decisions.md → «Доступ определяется ролью, а не дверью»).
 *
 * Тексты экрана на клиенте и по-русски, как у всех служебных экранов (docs/frontend.md → «Язык»):
 * словарь водителя здесь не читается. Отказы ручек приходят кодом и текстом с сервера.
 */
export type MiniAppEmployeeScreen = {
  screen: 'employee';
  fullName: string;
  role: EmployeeRole;
  /**
   * Пароль для веба задан. Пока нет — экран показывает пункт «Пароль для входа с компьютера»;
   * задан — пункта нет: смена пароля живёт в вебе, на `/password` (issue #130).
   */
  passwordSet: boolean;
  /** Пусто — менеджер ни к одному офису не привязан, и экран говорит об этом словами. */
  offices: EmployeeOffice[];
};

/**
 * Сотрудник, чья учётка выключена. Водительский экран ему не показывается и в этом случае:
 * роль у Telegram одна, и выключенная учётка её не меняет. Текст — из словаря двери веба.
 */
export type MiniAppEmployeeDeniedScreen = {
  screen: 'employee_denied';
  message: string;
};

export type MiniAppStateResponse =
  | MiniAppMemberScreen
  | MiniAppEmployeeScreen
  | MiniAppEmployeeDeniedScreen
  | {
      screen: 'registration';
      /** Предвыбор по `language_code` из `initData`. Переключается на экране. */
      language: Language;
      /**
       * Оба языка сразу: переключатель работает мгновенно и за ответом сервера не ходит.
       * Двух строк на экран — цена, которую не жалко.
       */
      texts: Record<Language, RegistrationScreenTexts>;
    };

export type MiniAppRegisterRequestBody = {
  /**
   * Подписанная строка контакта — поле `response` из ответа `requestContact`.
   *
   * Телефон берётся **только** отсюда и проверяется подписью на сервере. Отдельного поля
   * с номером в запросе нет и быть не может: номер, присланный клиентом рядом с подписью,
   * — это номер, который выбрал клиент.
   */
  contactData: string;
  /**
   * Выбранный на экране язык. Единственное поле запроса, которое подписью не подтверждено,
   * — и единственное, которое подтверждать нечем: это выбор человека, сделанный только что.
   * Сервер сверяет его со словарём и отвергает всё остальное.
   */
  language: Language;
};

export type MiniAppRegisterResponse = {
  outcome: LinkAttemptOutcome;
  /** Язык ответа. У удачи — язык участника, а не выбранный сейчас. */
  language: Language;
  message: string;
  /** Список офисов под текстом. Пуст у исходов, которые походом в офис не решаются. */
  offices: OfficeContact[];
  /**
   * Осмысленно ли повторить ту же кнопку.
   *
   * Ложь — не строгость, а то же решение, что снимало клавиатуру в боте: кнопка под
   * окончательным отказом звала бы человека в действие, которое даст тот же ответ.
   */
  canRetry: boolean;
};
