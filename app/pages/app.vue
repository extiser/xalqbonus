<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { formatPhone, type FormattedPhone } from '#shared/phone';
import {
  INIT_DATA_HEADER,
  type Language,
  type MemberOffice,
  type MemberOrder,
  type MiniAppEmployeeDeniedScreen,
  type MiniAppEmployeeScreen,
  type MiniAppMemberScreen,
  type MiniAppRegisterResponse,
  type MiniAppStateResponse,
  type RegistrationScreenTexts,
} from '#shared/types/miniapp';
import { useCountUp } from '~/composables/useCountUp';
import { useEmployeePassword } from '~/composables/useEmployeePassword';
import { useMemberHistory } from '~/composables/useMemberHistory';
import { useMemberOrders } from '~/composables/useMemberOrders';
import { useMemberRewards } from '~/composables/useMemberRewards';
import { useOfficeDesk } from '~/composables/useOfficeDesk';
import type { MemberManagerIdsView, MemberOfficeView } from '~/types/memberView';
import {
  HOME_HISTORY_SIZE,
  historyView,
  homeOrdersView,
  homeRewardsView,
  orderDetailView,
  ordersScreenView,
  rewardDetailView,
  rewardsScreenView,
} from '~/utils/memberViews';
import { failureDenial } from '~/utils/requestError';
import {
  hasSignedInitData,
  loadTelegramWebApp,
  resolveInitData,
  TELEGRAM_SDK_URL,
  type TelegramWebApp,
} from '~/composables/useTelegramWebApp';

/**
 * Экран водителя: регистрация в программе или приветствие участника. Или экран сотрудника —
 * выдача заказов по коду, если приложение открыл сотрудник парка (issue #122).
 *
 * Личность приходит от Telegram подписанной строкой и уезжает на сервер заголовком
 * с каждым запросом. Своего входа и своей сессии здесь нет и не будет: они означали бы
 * учётную запись на четыре тысячи человек и восстановление доступа к ней
 * (docs/miniapp.md → «Личность приходит от мессенджера»).
 *
 * Всё происходит на клиенте: `initData` живёт в странице, открытой Telegram, и на сервере
 * при отрисовке её не существует. Поэтому запрос состояния идёт из `onMounted`, а не
 * через `useFetch`.
 */

/**
 * Раскладка выбирается стадией и экраном, а не одна на страницу: загрузка, заглушки, регистрация,
 * отказ выключенному сотруднику, а у участника главная, история, заказы, награды и их экраны —
 * уже на новых макетах (`miniapp-next`). Цепочка обмена и экран сотрудника — ещё на старых
 * (`miniapp`), до своих задач. Смена оформления при переходе между старым и новым экраном
 * участника — ожидаемое временное состояние (issue #210, #215).
 *
 * Своим `<NuxtLayout :name>` в шаблоне, а не `setPageLayout`: раскладку страницы Nuxt рисует
 * с ключом по её имени, и смена имени пересоздаёт страницу целиком — вместе с состоянием
 * и `onMounted`. Загрузка сменилась бы экраном участника, тот — снова загрузкой, и так по кругу.
 * Раскладка внутри страницы пересоздаёт только экран под собой, а он при смене стадии
 * меняется и так.
 */
definePageMeta({ layout: false });

useHead({
  title: 'XalqBonus',
  /**
   * Mini App не масштабируется: двойной тап и щипок увеличивали экран, и вернуть его назад
   * водитель в поездке не мог. Здесь, а не в `nuxt.config.ts`: веб-админку это не касается.
   * Щипок в iOS этим не выключается — его гасит обработчик жестов ниже.
   */
  meta: [
    {
      name: 'viewport',
      content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
    },
  ],
  /**
   * Скрипт Telegram — тегом в `<head>` этой страницы, и только этой: веб-морда парка
   * ходить на `telegram.org` не должна, поэтому не `nuxt.config.ts`.
   *
   * Ни `async`, ни `defer`: обычный блокирующий тег в отрисованной сервером странице
   * исполняется до гидрации, то есть до того, как Vue Router тронет адрес и раскодирует
   * хеш с подписанной строкой. Вставка того же скрипта из `onMounted` опаздывает
   * ровно на это и получает огрызок вместо личности (issue #90).
   */
  script: [{ src: TELEGRAM_SDK_URL }],
});

/** Заглушка вместо экрана — свойства `MemberStubScreen`. */
type StubView = {
  blocks: { title: string; paragraphs: string[] }[];
  /** Кнопка «Обновить». Нет — повтор дал бы тот же ответ. */
  retryLabel: string | null;
};

/** Кнопка заглушки: перечитать экран. Заглушку видят и водитель, и сотрудник. */
const RETRY_LABEL = 'Yangilash / Обновить';

/**
 * Две заглушки, текстов которых нет в серверном словаре, — и не по недосмотру: показываются
 * они ровно тогда, когда сервер не ответил или его не спрашивали вовсе. Спросить у него перевод
 * в этот момент не у кого.
 *
 * На двух языках сразу, узбекский первым: чей это человек, мы здесь ещё не знаем. Всё остальное,
 * включая ответ устаревшему клиенту, приезжает с сервера на языке водителя — к тому моменту
 * экран регистрации уже загружен. Тексты — из макетов `_reference/design/registration/state-*.html`.
 */
const LOAD_FAILED: StubView = {
  blocks: [
    { title: "Yuklab bo'lmadi", paragraphs: ["Ma'lumotlarni yuklab bo'lmadi.\nQaytadan urinib ko'ring."] },
    { title: 'Не удалось загрузить', paragraphs: ['Не удалось загрузить данные.\nПопробуйте ещё раз.'] },
  ],
  retryLabel: RETRY_LABEL,
};

/**
 * Открыто не из Telegram. Кнопки нет: подписанной строки не появится, сколько ни повторяй
 * (issue #132). Название кнопки — как у кнопки бота `button_open_app`, без значка.
 */
const OPEN_FROM_TELEGRAM: StubView = {
  blocks: [
    {
      title: 'Telegram orqali oching',
      paragraphs: ['Ilova faqat Telegram ichida ishlaydi.\nBotni oching va «Ilovani ochish» tugmasini bosing.'],
    },
    {
      title: 'Откройте через Telegram',
      paragraphs: ['Приложение работает только внутри Telegram.\nОткройте бота и нажмите «Открыть приложение».'],
    },
  ],
  retryLabel: null,
};

/**
 * Заглушка «не загрузилось» одной строкой — запасной текст отказа витрины и заказа на случай,
 * если тексты участника ещё не пришли.
 */
const LOAD_FAILED_TEXT = LOAD_FAILED.blocks
  .map((block) => block.paragraphs.join(' ').replaceAll('\n', ' '))
  .join(' / ');

/** Абзацы текста из словаря: они разделены пустой строкой. */
const toParagraphs = (text: string): string[] => text.split('\n\n');

/**
 * Что показываем прямо сейчас. Загрузка и отказ различаются намеренно: они значат разное.
 *
 * `employee_denied` — выключенный сотрудник: экран исхода регистрации, а не заглушка,
 * потому что на нём номер и Telegram ID, по которым руководитель найдёт учётку.
 */
type Stage = 'loading' | 'error' | 'member' | 'registration' | 'employee' | 'employee_denied';

const stage = ref<Stage>('loading');

/** Стадии на новых макетах целиком. У участника раскладка — по экрану, сотрудник — ещё на старых. */
const NEXT_LAYOUT_STAGES: ReadonlySet<Stage> = new Set<Stage>(['loading', 'error', 'registration', 'employee_denied']);

/** Заглушка на стадии `error`. */
const stub = ref<StubView | null>(null);

/**
 * Загрузчик уходит. Следующая стадия ставится не сразу, а когда он ушёл целиком (`left`):
 * иначе кольцо обрывается на полуобороте.
 */
const loadingLeaving = ref(false);

/** Что показать, когда загрузчик ушёл. */
let afterLoading: (() => void) | null = null;

/**
 * Показывает следующий экран. С загрузки — через уход загрузчика, с любого другого экрана —
 * сразу: регистрация после удачной привязки держит «Проверяем…» до смены экрана, а не
 * показывает загрузку второй раз.
 */
const showNext = (next: () => void): void => {
  if (stage.value !== 'loading') {
    next();

    return;
  }

  afterLoading = next;
  loadingLeaving.value = true;
};

const onLoadingLeft = (): void => {
  const next = afterLoading;

  afterLoading = null;
  next?.();
  loadingLeaving.value = false;
};

/** Экран участника: баланс, имя, отметки свежести и тексты. */
const member = ref<MiniAppMemberScreen | null>(null);

/**
 * Баланс в шапках разделов — тем же набором, что крупное число главной: ключ общий, и число
 * меняется набором от показанного, а без изменения стоит как есть.
 */
const balanceAmount = useCountUp(() => member.value?.balancePoints ?? 0);

/**
 * Регистрация: шаг 1 — язык, шаг 2 — номер, после отправки — экран исхода.
 *
 * Язык держится здесь до конца потока, в базу его не пишет ни один шаг: в `person_settings`
 * его кладёт сервер при удачной привязке нового участника — тот, что уехал в запросе.
 */
type RegistrationStep = 'language' | 'phone';

/** Тексты регистрации на обоих языках. Их же читает отказ выключенному сотруднику. */
const screenTexts = ref<Record<Language, RegistrationScreenTexts> | null>(null);
const registrationStep = ref<RegistrationStep>('language');
const language = ref<Language>('ru');

/** Запрос регистрации в пути: кнопка и язык гаснут, под кнопкой «Проверяем…». */
const sending = ref(false);

type RegistrationRefusal = Exclude<MiniAppRegisterResponse, { outcome: 'linked' }>;

/** Последний отказ регистрации. Есть — показывается экран исхода, следующий ответ его заменяет. */
const refusal = ref<RegistrationRefusal | null>(null);

/** Отказ выключенному сотруднику. */
const employeeDenied = ref<MiniAppEmployeeDeniedScreen | null>(null);

const currentTexts = computed(() => screenTexts.value?.[language.value] ?? null);

let webApp: TelegramWebApp | null = null;

/**
 * Подписанная строка этой загрузки страницы.
 *
 * Берётся не у объекта Telegram напрямую: после перезагрузки страницы адрес уже испорчен
 * роутером, SDK разбирает по нему огрызок, и личность в этот момент есть только в нашей
 * копии (`resolveInitData`, issue #105).
 */
let initData = '';

/**
 * История участника. Своим запросом, а не полем экрана: история листается прокруткой,
 * и пересобирать ради каждой страницы весь экран незачем.
 */
const memberHistory = useMemberHistory(() => initData);

/**
 * Обмен баллов: офисы, витрина, оформление и заказы. Запасной текст отказа — из текстов
 * экрана участника: к моменту первого запроса витрины они уже загружены.
 */
const memberOrders = useMemberOrders(
  () => initData,
  () => member.value?.orderTexts.requestFailed ?? LOAD_FAILED_TEXT,
);

/**
 * Награды участника: блок на главной и раздел «Мои награды» (issue #172). Акция на главной
 * не читается до своей задачи: пилюли и плашки там пока нет (issue #210).
 */
const memberRewards = useMemberRewards(() => initData);

/**
 * Экран сотрудника: его офисы, выбранный офис и стойка выдачи.
 *
 * Своего пути по экранам у него нет: выбор офиса, стойка и карточка заказа выводятся
 * из состояния — выбран ли офис, открыт ли заказ, — и «назад» снимает ровно последнее из них.
 */
const employee = ref<MiniAppEmployeeScreen | null>(null);
const employeeOfficeId = ref<string | null>(null);
const employeeCode = ref('');

// Отказ отдаётся странице обёрткой, а не самой функцией: `reportDoorDenial` объявлена ниже,
// рядом с `loadState`, и к моменту первого запроса уже существует.
const officeDesk = useOfficeDesk(
  () => ({ [INIT_DATA_HEADER]: initData }),
  (error) => reportDoorDenial(error),
);

const employeeOffice = computed(
  () => employee.value?.offices.find((office) => office.officeId === employeeOfficeId.value) ?? null,
);

/**
 * Пункт «Пароль для входа с компьютера» открыт (issue #130).
 *
 * Открывается и с выбора офиса, и со стойки: сотрудник с единственным офисом попадает на стойку
 * сразу и выбора офиса не видит никогда, а без офиса вовсе стойки нет. «Назад» закрывает пункт
 * и возвращает туда, откуда его открыли, — стойка и выбранный офис под ним не сбрасываются.
 */
const employeePasswordOpen = ref(false);

/**
 * Название пункта — одно на обе кнопки. Его же дословно цитирует бот после принятия приглашения
 * (`invite_accepted` в `server/bot/texts.ts`): меняется здесь — меняется и там.
 */
const EMPLOYEE_PASSWORD_LABEL = 'Пароль для входа с компьютера';

const employeePassword = useEmployeePassword(
  () => ({ [INIT_DATA_HEADER]: initData }),
  (error) => reportDoorDenial(error),
);

const openEmployeePassword = (): void => {
  employeePassword.reset();
  employeePasswordOpen.value = true;
};

/**
 * Пароль сохранён — пункт с экрана уходит. Признак ставится в уже прочитанном экране, а не
 * перечитыванием `/api/miniapp/me`: экран читается один раз при открытии, и второй запрос
 * ради одного признака незачем. Иначе кнопка висела бы до перезахода и звала повторить сделанное.
 */
const saveEmployeePassword = async (): Promise<void> => {
  if ((await employeePassword.submit()) && employee.value) {
    employee.value.passwordSet = true;
  }
};

/**
 * Есть ли куда вернуться: из пункта пароля — туда, откуда открыли; из карточки — к полю кода;
 * от поля кода — к выбору из нескольких офисов.
 */
const employeeCanGoBack = computed(
  () =>
    employeePasswordOpen.value ||
    officeDesk.current.value !== null ||
    (employeeOffice.value !== null && (employee.value?.offices.length ?? 0) > 1),
);

const selectEmployeeOffice = (officeId: string): void => {
  employeeOfficeId.value = officeId;
  employeeCode.value = '';
  officeDesk.reset();
  void officeDesk.loadPending(officeId);
};

const employeeBack = (): void => {
  if (employeePasswordOpen.value) {
    employeePasswordOpen.value = false;

    return;
  }

  if (officeDesk.current.value) {
    officeDesk.close();

    return;
  }

  if ((employee.value?.offices.length ?? 0) > 1) {
    employeeOfficeId.value = null;
  }
};

const searchOrderCode = (code: string): void => {
  if (employeeOfficeId.value) {
    void officeDesk.findByCode(employeeOfficeId.value, code);
  }
};

/**
 * Выдача и отмена у стойки. После любого исхода список висящих перечитывается: и после
 * выдачи, и после отказа «уже выдан» прежний список врёт. Поле кода пустеет только после
 * удачи — следующий водитель уже называет свой.
 */
const finishEmployeeAction = async (done: boolean): Promise<void> => {
  if (done) {
    employeeCode.value = '';
  }

  if (employeeOfficeId.value) {
    await officeDesk.loadPending(employeeOfficeId.value);
  }
};

const issueEmployeeItem = async (): Promise<void> => {
  await finishEmployeeAction(await officeDesk.issue());
};

const cancelEmployeeOrder = async (): Promise<void> => {
  await finishEmployeeAction(await officeDesk.cancel());
};

/**
 * Экраны участника.
 *
 * Переключаются внутри страницы, а не адресами: адрес Mini App несёт в хеше подписанную
 * строку, и роутер при переходе портит её (issue #90, #105). «Назад» — своей кнопкой экрана:
 * системная кнопка Telegram в приложении не используется.
 */
type MemberScreenName =
  | 'home'
  | 'history'
  | 'offices'
  | 'showcase'
  | 'confirm'
  | 'order'
  | 'orders'
  | 'rewards'
  | 'reward';

/** Путь по экранам. Последний — показанный; «назад» снимает его. */
const screens = ref<MemberScreenName[]>(['home']);
const currentScreen = computed<MemberScreenName>(() => screens.value.at(-1) ?? 'home');

/** Экраны участника на новых макетах. У них «назад» — в шапке, у старых — кнопкой внизу. */
const NEXT_MEMBER_SCREENS: ReadonlySet<MemberScreenName> = new Set<MemberScreenName>([
  'home',
  'history',
  'orders',
  'order',
  'rewards',
  'reward',
]);

const layout = computed(() => {
  if (stage.value === 'member') {
    return NEXT_MEMBER_SCREENS.has(currentScreen.value) ? 'miniapp-next' : 'miniapp';
  }

  return NEXT_LAYOUT_STAGES.has(stage.value) ? 'miniapp-next' : 'miniapp';
});

/** Заказ, открытый на экране заказа: только что оформленный или выбранный из списка. */
const currentOrder = ref<MemberOrder | null>(null);

/**
 * Награда, открытая на экране награды. Номером, а не копией: экран строится из списка наград,
 * и перечитанный список — после возврата из фона — сразу показывает её новое состояние.
 */
const currentRewardId = ref<string | null>(null);

/** Шторка «Отменить заказ?» открыта. */
const cancelSheetOpen = ref(false);

const openScreen = (screen: MemberScreenName): void => {
  screens.value = [...screens.value, screen];
};

const goBack = (): void => {
  if (stage.value === 'employee') {
    employeeBack();

    return;
  }

  if (screens.value.length <= 1) {
    return;
  }

  screens.value = screens.value.slice(0, -1);

  // Экран, на который вернулись, мог устареть: заказ отменили, баллы списались, награду выдали.
  // Главная, заказы и награды перечитываются тихо — водитель ничего не просил, и мигать
  // загрузкой незачем.
  if (currentScreen.value === 'home') {
    void reloadHome();
  } else if (currentScreen.value === 'orders') {
    void memberOrders.reloadOrders();
  } else if (currentScreen.value === 'rewards') {
    void memberRewards.reload();
  }
};

// Новый экран открывается с начала, а не с той высоты, на которой листали прошлый.
watch(currentScreen, () => {
  window.scrollTo(0, 0);
});

// Пункт пароля открывается с начала экрана. Отдельно от наблюдателя ниже: со стойки из нескольких
// офисов «назад» есть и до открытия пункта, и признак возврата при открытии не меняется.
watch(employeePasswordOpen, () => {
  window.scrollTo(0, 0);
});

watch(employeeCanGoBack, () => {
  if (stage.value !== 'employee') {
    return;
  }

  window.scrollTo(0, 0);
});

const openExchange = (): void => {
  openScreen('offices');
  void memberOrders.loadOffices();
};

/**
 * Раздел заказов. Список уже прочитан для главной — тогда он перечитывается тихо, и раздел
 * открывается сразу с заказами; не прочитался — с загрузкой, как в первый раз.
 */
const openOrders = (): void => {
  openScreen('orders');
  void (memberOrders.ordersState.value === 'ready' ? memberOrders.reloadOrders() : memberOrders.loadOrders());
};

/** Раздел истории: страницы уже читает главная, раздел показывает их все и листает дальше. */
const openHistory = (): void => {
  openScreen('history');
};

/** Раздел наград — тем же правилом, что заказы: прочитанный для главной список перечитывается тихо. */
const openRewards = (): void => {
  openScreen('rewards');
  void (memberRewards.state.value === 'ready' ? memberRewards.reload() : memberRewards.load());
};

/**
 * Награда из блока главной или из раздела: карточка отдаёт номер. Баллы не открываются —
 * экран награды им не нужен; их карточка и не нажимается, проверка здесь на всякий случай.
 */
const openReward = (rewardId: string): void => {
  const reward = memberRewards.rewards.value.find((entry) => entry.rewardId === rewardId);

  if (!reward || reward.kind === 'points') {
    return;
  }

  currentRewardId.value = rewardId;
  openScreen('reward');
};

const selectOffice = (officeId: string): void => {
  openScreen('showcase');
  void memberOrders.openShowcase(officeId);
};

const changeQuantity = (productId: string, step: number): void => {
  memberOrders.setQuantity(productId, (memberOrders.quantities.value[productId] ?? 0) + step);
};

const openConfirm = (): void => {
  memberOrders.resetPlaceError();
  openScreen('confirm');
};

const placeOrder = async (): Promise<void> => {
  const order = await memberOrders.place();

  if (!order) {
    return;
  }

  currentOrder.value = order;
  cancelSheetOpen.value = false;
  // Назад с экрана оформленного заказа — на экран участника, а не в витрину: корзина пуста,
  // а подтверждать тот же заказ второй раз незачем. Экран заказа — уже новый, как у заказа
  // из списка.
  screens.value = ['home', 'order'];
  void reloadMember();
};

/** Заказ из блока главной или из раздела: карточка отдаёт номер, заказ берётся из списка. */
const openOrder = (orderId: string): void => {
  const order = memberOrders.orders.value.find((entry) => entry.orderId === orderId);

  if (!order) {
    return;
  }

  currentOrder.value = order;
  cancelSheetOpen.value = false;
  openScreen('order');
};

const askCancelOrder = (): void => {
  memberOrders.resetCancelError();
  cancelSheetOpen.value = true;
};

/** «Нет» и Escape. Пока отмена в пути, шторка не закрывается: запрос уже ушёл. */
const closeCancelSheet = (): void => {
  if (!memberOrders.cancelling.value) {
    cancelSheetOpen.value = false;
  }
};

/**
 * «Да» в шторке. Удача — шторка закрывается, экран показывает ответ сервера, баланс
 * перечитывается и набирается к новому значению. Отказ — текстом в той же шторке, она открыта.
 */
const cancelCurrentOrder = async (): Promise<void> => {
  const order = currentOrder.value;

  if (!order) {
    return;
  }

  const cancelled = await memberOrders.cancel(order.orderId);

  if (cancelled) {
    currentOrder.value = cancelled;
    cancelSheetOpen.value = false;
    void reloadMember();
  }
};

/** Карта офиса заказа — наружу, в Яндекс Картах или браузере, а не поверх приложения. */
const openOrderMap = (): void => {
  const mapUrl = currentOrder.value?.office.mapUrl;

  if (mapUrl) {
    window.open(mapUrl, '_blank', 'noopener');
  }
};

/** Карта офиса награды — наружу, как у заказа. */
const openRewardMap = (): void => {
  const mapUrl = memberRewards.rewards.value.find((entry) => entry.rewardId === currentRewardId.value)?.office?.mapUrl;

  if (mapUrl) {
    window.open(mapUrl, '_blank', 'noopener');
  }
};

/** Баланс в шапке разделов: «Ваши баллы» и число в наборе. */
const sectionBalance = computed(() =>
  member.value ? { label: member.value.texts.balanceTitle, amount: balanceAmount.value } : undefined,
);

/**
 * Главная — свойствами `MemberHome`. Акции, приглашения, подарков и каталога нет: пилюлю
 * и плашку подключает задача акции, а товары без выбранного офиса не отдаёт ни одна ручка.
 */
const homeView = computed(() => {
  const current = member.value;

  if (!current) {
    return null;
  }

  const { texts } = current;

  return {
    name: current.name,
    callsign: current.callsign ?? undefined,
    points: current.balancePoints,
    orders: homeOrdersView(memberOrders.ordersState.value, memberOrders.orders.value, texts),
    rewards: homeRewardsView(memberRewards.state.value, memberRewards.rewards.value, texts),
    history: historyView(memberHistory.state.value, memberHistory.operations.value.slice(0, HOME_HISTORY_SIZE)),
    texts: {
      profile: texts.profile,
      balanceTitle: texts.balanceTitle,
      exchange: texts.exchange,
      updated: current.updatedNote,
      ordersTitle: texts.ordersTitle,
      ordersAll: texts.ordersAll,
      ordersEmpty: texts.ordersEmpty,
      ordersError: texts.ordersFailed,
      rewardsTitle: texts.rewardsTitle,
      rewardsAll: texts.rewardsAll,
      rewardsEmpty: texts.rewardsEmpty,
      rewardsError: texts.rewardsFailed,
      historyTitle: texts.historyTitle,
      historyAll: texts.historyAll,
      historyEmpty: texts.historyEmpty,
      historyError: texts.historyFailed,
      retry: texts.retry,
    },
  };
});

/** Раздел «История баллов»: все загруженные страницы по дням. */
const historyScreenView = computed(() => {
  const current = member.value;

  if (!current) {
    return null;
  }

  return {
    ...historyView(memberHistory.state.value, memberHistory.operations.value),
    hasMore: memberHistory.nextCursor.value !== null,
    loadingMore: memberHistory.loadingMore.value,
    moreFailed: memberHistory.moreFailed.value,
    balance: sectionBalance.value,
    texts: {
      title: current.texts.historyTitle,
      back: current.texts.back,
      synced: current.tripsNote.text,
      empty: current.texts.historyEmpty,
      error: current.texts.historyFailed,
      retry: current.texts.retry,
    },
  };
});

/** Раздел «Мои заказы». */
const ordersScreen = computed(() => {
  const current = member.value;

  if (!current) {
    return null;
  }

  const { texts } = current;

  return {
    ...ordersScreenView(memberOrders.ordersState.value, memberOrders.orders.value, texts),
    balance: sectionBalance.value,
    texts: {
      title: texts.ordersTitle,
      back: texts.back,
      pendingGroup: texts.ordersGroupPending,
      pastGroup: texts.ordersGroupPast,
      groupEmpty: texts.groupEmpty,
      empty: texts.ordersEmpty,
      error: texts.ordersFailed,
      retry: texts.retry,
    },
  };
});

/** Экран заказа и его шторка отмены. */
const orderScreen = computed(() => {
  const current = member.value;
  const order = currentOrder.value;

  if (!current || !order) {
    return null;
  }

  const { texts } = current;

  return {
    order: orderDetailView(order, texts),
    balance: sectionBalance.value,
    texts: {
      back: texts.back,
      codeTitle: texts.orderCodeTitle,
      officeTitle: texts.orderOfficeTitle,
      map: texts.officeMap,
      linesTitle: texts.orderLinesTitle,
      total: texts.orderTotal,
      cancel: texts.cancelOrder,
    },
    sheetTexts: { question: texts.cancelQuestion, hint: texts.cancelHint, yes: texts.yes, no: texts.no },
  };
});

/**
 * Раздел «Мои награды». Подарков от Xalq Taxi здесь нет — их подключает своя задача, и тексты
 * их группы пусты: без подарков экран их не рисует.
 */
const rewardsScreen = computed(() => {
  const current = member.value;

  if (!current) {
    return null;
  }

  const { texts, rewardTexts } = current;

  return {
    ...rewardsScreenView(memberRewards.state.value, memberRewards.rewards.value, texts),
    balance: sectionBalance.value,
    texts: {
      title: texts.rewardsTitle,
      back: texts.back,
      giftsGroup: '',
      take: '',
      awaitingGroup: rewardTexts.awaitingGroup,
      pastGroup: rewardTexts.pastGroup,
      groupEmpty: texts.groupEmpty,
      empty: texts.rewardsEmpty,
      error: texts.rewardsFailed,
      retry: texts.retry,
    },
  };
});

/** Экран награды — из того же списка, что раздел: своей ручки у одной награды нет. Баланса в шапке нет. */
const rewardScreen = computed(() => {
  const current = member.value;
  const reward = memberRewards.rewards.value.find((entry) => entry.rewardId === currentRewardId.value);

  if (!current || !reward) {
    return null;
  }

  const detail = rewardDetailView(reward, current.texts);

  if (!detail) {
    return null;
  }

  const { texts, rewardTexts } = current;

  return {
    reward: detail,
    texts: {
      title: rewardTexts.screenTitle,
      back: texts.back,
      codeTitle: rewardTexts.codeTitle,
      officeTitle: texts.orderOfficeTitle,
      map: texts.officeMap,
      linesTitle: rewardTexts.screenTitle,
      total: texts.orderTotal,
    },
  };
});

/**
 * Показывает то, что ответил сервер.
 *
 * Блоки главной поднимает вызывающий, а не этот код: первая загрузка экрана и перечитывание
 * читают их по-разному — с состоянием загрузки и тихо (issue #107). Путь по экранам участника
 * здесь не трогается: перечитывание меняет данные, а не экран, на котором стоит водитель.
 */
const applyState = (state: MiniAppStateResponse): void => {
  if (state.screen === 'member') {
    member.value = state;
    stage.value = 'member';

    return;
  }

  if (state.screen === 'employee') {
    employee.value = state;
    stage.value = 'employee';

    // Один офис — выбирать нечего, стойка открывается сразу.
    const [onlyOffice] = state.offices;

    if (state.offices.length === 1 && onlyOffice) {
      selectEmployeeOffice(onlyOffice.officeId);
    }

    return;
  }

  if (state.screen === 'employee_denied') {
    resetScreenWork();
    employeeDenied.value = state;
    screenTexts.value = state.texts;
    // Служебная часть русская (docs/frontend.md → «Язык»): экран открывается на русском,
    // узбекский — переключателем.
    language.value = 'ru';
    stage.value = 'employee_denied';

    return;
  }

  // Регистрация — с шага 1: язык выбирает человек, и «Обновить» после сбоя возвращает
  // к началу, а не к экрану, с которого ушёл запрос.
  screenTexts.value = state.texts;
  registrationStep.value = 'language';
  refusal.value = null;
  stage.value = 'registration';
};

/**
 * Снимает всё, что человек успел сделать на экране: выбранный офис, набранный код, открытый
 * заказ, пункт пароля, путь по экранам участника.
 *
 * Заглушка — это текст и больше ничего, и прежнее состояние под ней не хранится: «Обновить»
 * возвращает экран с начала, каким его показывает первое открытие, а не стойку с кодом,
 * набранным до того, как доступ закрыли.
 */
const resetScreenWork = (): void => {
  employeeOfficeId.value = null;
  employeeCode.value = '';
  officeDesk.reset();
  employeePasswordOpen.value = false;
  employeePassword.reset();
  screens.value = ['home'];
  currentOrder.value = null;
  currentRewardId.value = null;
  cancelSheetOpen.value = false;
};

/** Заглушка вместо экрана. */
const failWith = (next: StubView): void => {
  resetScreenWork();
  stub.value = next;
  stage.value = 'error';
};

/**
 * «Обновить» на заглушке: тот же запрос, что при первом открытии. Вернулся доступ — рабочий
 * экран на месте, без закрытия приложения; не вернулся — снова заглушка с новым ответом.
 */
const retry = async (): Promise<void> => {
  stage.value = 'loading';

  await loadState();
};

/** Запрос состояния экрана. Один на первую загрузку и на перечитывание: спрашивается то же. */
const fetchState = (): Promise<MiniAppStateResponse> =>
  $fetch<MiniAppStateResponse>('/api/miniapp/me', {
    headers: { [INIT_DATA_HEADER]: initData },
  });

/** Спрашивает сервер, что показать этому человеку, и показывает. */
const loadState = async (): Promise<void> => {
  try {
    const state = await fetchState();

    showNext(() => applyState(state));

    if (state.screen === 'member') {
      // Блоки главной догружаются следом, каждый своим состоянием: отказ гасит блок, а не экран
      // с балансом — баланс уже прочитан и врать о нём нечему.
      void memberOrders.loadOrders();
      void memberRewards.load();
      void memberHistory.loadFirstPage();
    }
  } catch (error) {
    // Текст на экране прежний — причина отказа водителю ничего не чинит. Но в консоли
    // она обязана быть: это единственное окно наружу, которое у Mini App есть, и без
    // записи `malformed` и `hash_mismatch` снаружи выглядят одинаково (issue #90).
    console.error('[miniapp] не удалось получить состояние экрана', error);
    showNext(() => failWith(LOAD_FAILED));
  }
};

/**
 * Отказ двери посреди работы — одно решение на все ручки открытого приложения.
 *
 * Сотрудника выключили, пока приложение было открыто: отказ строкой под полем кода, рядом
 * с набранным кодом и списком «Ждут выдачи», читался как «заказ не найден» (прогон на стенде
 * 14-09-2026, issue #132). Поэтому отказ двери перечитывает экран: выключенному придёт тот же
 * отказ, что при холодном открытии (`employee_denied`), с его номером и Telegram ID. Ручка
 * не ответила — заглушка «не загрузилось», как при первом открытии.
 *
 * Отказ двери от доменного отличает словарь: `failureDenial` возвращает код только для
 * отказов из `shared/denials.ts`. Остальные — «заказ не найден», «пароль короче» — остаются
 * строкой у поля: композабл получает `false` и показывает их сам.
 */
const reportDoorDenial = (error: unknown): boolean => {
  if (failureDenial(error) === null) {
    return false;
  }

  void loadState();

  return true;
};

/**
 * Перечитывает экран участника тихо: баланс, имя и отметки свежести.
 *
 * Кнопки обновления нет (решение Руслана 25-09-2026, issue #210): экран перечитывается сам —
 * при возврате на главную, при возврате в приложение из фона и после отмены заказа. Отдельно
 * от `loadState`, потому что отказ здесь значит другое: на экране уже стоит прочитанный баланс,
 * и увести его в заглушку значило бы стереть верные данные в ответ на перечитывание, которого
 * водитель не просил. Отказ остаётся в консоли, экран — прежним.
 */
const reloadMember = async (): Promise<void> => {
  try {
    applyState(await fetchState());
  } catch (error) {
    console.error('[miniapp] не удалось перечитать экран участника', error);
  }
};

/** Главная целиком и тихо: экран участника и три блока — заказы, награды, первая страница истории. */
const reloadHome = async (): Promise<void> => {
  await Promise.all([
    reloadMember(),
    memberOrders.reloadOrders(),
    memberRewards.reload(),
    memberHistory.reloadFirstPage().catch((error: unknown) => {
      console.error('[miniapp] не удалось перечитать историю', error);
    }),
  ]);
};

/**
 * Возврат в приложение из фона: пока Telegram был свёрнут, баллы могли прийти. На новых экранах
 * участника перечитывается баланс, на главной — ещё её блоки, в разделе заказов — список,
 * в разделе и на экране награды — список наград: награду могли выдать у стойки.
 * Старые экраны не трогаются: в цепочке обмена перечитывание сбило бы корзину.
 */
const onVisibilityChange = (): void => {
  if (document.visibilityState !== 'visible' || stage.value !== 'member') {
    return;
  }

  if (currentScreen.value === 'home') {
    void reloadHome();
  } else if (NEXT_MEMBER_SCREENS.has(currentScreen.value)) {
    void reloadMember();

    if (currentScreen.value === 'orders') {
      void memberOrders.reloadOrders();
    } else if (currentScreen.value === 'rewards' || currentScreen.value === 'reward') {
      void memberRewards.reload();
    }
  }
};

/** Щипок в iOS: `user-scalable=no` Safari не слушает, жест гасится здесь. */
const preventGesture = (event: Event): void => {
  event.preventDefault();
};

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('gesturestart', preventGesture);
  document.addEventListener('gesturechange', preventGesture);
});

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange);
  document.removeEventListener('gesturestart', preventGesture);
  document.removeEventListener('gesturechange', preventGesture);
});

onMounted(async () => {
  webApp = await loadTelegramWebApp();
  initData = resolveInitData(webApp);

  // Ни строки от Telegram, ни своей копии — значит страницу открыли не из мессенджера.
  // Это не поломка, и разбирать её незачем: человеку нужно сказать, где дверь.
  //
  // Признак — `hash` и `auth_date` в строке, а не её непустота: в обычном браузере SDK
  // отдаёт непустой огрызок, и по пустоте человек вне Telegram получал бы сообщение
  // о поломке вместо указания, где вход.
  if (!hasSignedInitData(initData)) {
    showNext(() => failWith(OPEN_FROM_TELEGRAM));

    return;
  }

  // Вызовы объекта, а не строки: после перезагрузки страницы личность приехала из копии,
  // а заставку убирает и окно разворачивает по-прежнему клиент Telegram.
  webApp?.ready();
  webApp?.expand();

  await loadState();
});

/** Отправляет подписанную строку контакта на сервер и показывает исход. */
const register = async (contactData: string): Promise<void> => {
  sending.value = true;

  try {
    const response = await $fetch<MiniAppRegisterResponse>('/api/miniapp/register', {
      method: 'POST',
      headers: { [INIT_DATA_HEADER]: initData },
      body: { contactData, language: language.value },
    });

    if (response.outcome === 'linked') {
      // Привязались — экрана регистрации у этого человека больше нет, как и у всякого
      // участника. Экран участника перечитывается у сервера целиком, а не собирается
      // из ответа привязки: баланс, отметка свежести и обещание бонуса приходят оттуда же,
      // откуда придут при следующем открытии приложения, — иначе первый экран нового
      // участника отличался бы от всех последующих. «Проверяем…» держится до смены экрана.
      await loadState();

      return;
    }

    // Экран исхода открывается на языке, с которым ушёл запрос, и заменяет прежний.
    language.value = response.language;
    refusal.value = response;
  } catch (error) {
    // Отказ ручки — не исход привязки: сервер до правил не дошёл, и говорить человеку
    // «подойдите в офис» не за что. В консоль пишется то, что случилось на самом деле.
    console.error('[miniapp] не удалось отправить номер на привязку', error);
    failWith(LOAD_FAILED);
  } finally {
    sending.value = false;
  }
};

/**
 * Нажатие «поделиться номером» — на шаге 2 и на повторе.
 *
 * До ответа системного окна экран не меняется и кнопка не гаснет. Причина не в удобстве:
 * закрытие окна свайпом не вызывает колбэк **вовсе** — ни ответа, ни события, — и любое
 * состояние ожидания здесь стало бы состоянием, из которого нет выхода (docs/miniapp.md).
 * Гаснет кнопка только на время запроса к серверу — его конец приходит всегда.
 */
const share = (): void => {
  const requestContact = webApp?.requestContact;

  if (!requestContact) {
    // Клиент старее Bot API 6.9: вызова в объекте нет вовсе, и номер внутри приложения
    // взять нечем. Текст свой, а не «откройте приложение через Telegram»: человек уже
    // в Telegram, и по той подсказке ему делать нечего — чинится это обновлением клиента.
    // Поэтому и кнопки нет: «Обновить» вернуло бы регистрацию и то же окно.
    //
    // Нажать кнопку можно только с экрана регистрации, а значит тексты уже загружены
    // и язык выбран: ответ идёт на нём, а не на двух сразу.
    const texts = currentTexts.value;

    if (texts) {
      failWith({
        blocks: [{ title: texts.outdatedClientTitle, paragraphs: toParagraphs(texts.outdatedClient) }],
        retryLabel: null,
      });
    }

    return;
  }

  requestContact((shared, contact) => {
    // Отказ возвращает экран в исходное состояние: кнопка на месте и нажимается снова.
    if (!shared || contact?.status !== 'sent' || !contact.response) {
      return;
    }

    void register(contact.response);
  });
};

/** Шаг 1: выбор языка сразу ведёт на шаг 2 — «Далее» нет. */
const selectLanguage = (next: Language): void => {
  language.value = next;
  registrationStep.value = 'phone';
};

/** Приветствие шага 1 — на обоих языках сразу: язык ещё не выбран. */
const welcome = computed(() => {
  const texts = screenTexts.value;

  return texts
    ? {
        uz: { title: texts.uz.welcomeTitle, lead: texts.uz.welcomeLead },
        ru: { title: texts.ru.welcomeTitle, lead: texts.ru.welcomeLead },
      }
    : null;
});

const managerIds = (texts: RegistrationScreenTexts, phone: FormattedPhone, telegramId: string): MemberManagerIdsView => ({
  texts: {
    title: texts.idsTitle,
    phoneLabel: texts.phoneLabel,
    telegramIdLabel: texts.telegramIdLabel,
    copyPhone: texts.copyPhone,
    copyTelegramId: texts.copyTelegramId,
  },
  phone,
  telegramId,
});

/** Офис на экране исхода: «Офис · » ставит экран, имя и адрес — из таблицы офисов. */
const officeView = (office: MemberOffice, texts: RegistrationScreenTexts): MemberOfficeView => ({
  label: texts.officeLabel,
  name: office.name,
  address: office.address,
  hours: office.workHours,
  phone: office.phone === null ? null : formatPhone(office.phone).display,
  mapUrl: office.mapUrl,
});

/**
 * Экран исхода — свойства `MemberRegistrationOutcome` на выбранном языке. `null` — исхода нет,
 * и показывается шаг регистрации.
 *
 * Текст исхода приходит абзацами через пустую строку; у повтора под ним — что делать, если
 * повтор не помогает. Язык переключается целиком, вместе с текстом исхода: он пришёл на обоих.
 */
const outcome = computed(() => {
  const texts = currentTexts.value;

  if (!texts) {
    return null;
  }

  if (stage.value === 'employee_denied' && employeeDenied.value) {
    return {
      kind: 'employee' as const,
      title: texts.employeeDeniedTitle,
      paragraphs: [texts.employeeDeniedText],
      ids: managerIds(texts, employeeDenied.value.phone, employeeDenied.value.telegramId),
    };
  }

  const response = refusal.value;

  if (stage.value !== 'registration' || !response) {
    return null;
  }

  const paragraphs = toParagraphs(response.message[language.value]);
  const ids = managerIds(texts, response.phone, response.telegramId);

  if (response.kind === 'employee') {
    return { kind: 'employee' as const, title: texts.officeTitle, paragraphs, ids };
  }

  const offices = {
    officesTitle: texts.officesTitle,
    offices: response.offices.map((office) => officeView(office, texts)),
    mapLabel: texts.mapLabel,
  };

  if (response.kind === 'retry') {
    return {
      kind: 'retry' as const,
      title: texts.retryTitle,
      paragraphs: [...paragraphs, texts.retryNote],
      ids,
      ...offices,
      ask: texts.ask,
      send: texts.retrySend,
      failed: texts.retryFailed,
      checking: texts.checking,
      busy: sending.value,
    };
  }

  return { kind: 'office' as const, title: texts.officeTitle, paragraphs, ids, ...offices };
});

/** Карта офиса открывается наружу — в Яндекс Картах или браузере, а не поверх приложения. */
const openMap = (office: MemberOfficeView): void => {
  if (office.mapUrl) {
    window.open(office.mapUrl, '_blank', 'noopener');
  }
};
</script>

<template>
  <NuxtLayout :name="layout">
    <OrganismsNextMemberLoadingScreen v-if="stage === 'loading'" :leaving="loadingLeaving" @left="onLoadingLeft" />

    <OrganismsNextMemberStubScreen v-else-if="stage === 'error' && stub" v-bind="stub" @retry="retry" />

    <div v-else-if="stage === 'employee' && employee" class="flex flex-col gap-6">
      <OrganismsEmployeePasswordForm
        v-if="employeePasswordOpen"
        v-model="employeePassword.password.value"
        :submitting="employeePassword.submitting.value"
        :error="employeePassword.error.value"
        :saved="employeePassword.saved.value"
        @submit="saveEmployeePassword"
        @done="employeeBack"
      />

      <template v-else-if="!employeeOffice">
        <OrganismsEmployeeOfficePicker
          :full-name="employee.fullName"
          :offices="employee.offices"
          @select="selectEmployeeOffice"
        />

        <AtomsMiniAppButton
          v-if="!employee.passwordSet"
          variant="secondary"
          :label="EMPLOYEE_PASSWORD_LABEL"
          @click="openEmployeePassword"
        />
      </template>

      <OrganismsEmployeeOrderCard
        v-else-if="officeDesk.current.value?.kind === 'order'"
        :order="officeDesk.current.value.order"
        :acting="officeDesk.acting.value"
        :error="officeDesk.actionError.value"
        @issue="issueEmployeeItem"
        @cancel="cancelEmployeeOrder"
        @close="officeDesk.close()"
      />

      <OrganismsEmployeeRewardCard
        v-else-if="officeDesk.current.value?.kind === 'reward'"
        :reward="officeDesk.current.value.reward"
        :acting="officeDesk.acting.value"
        :error="officeDesk.actionError.value"
        @issue="issueEmployeeItem"
        @close="officeDesk.close()"
      />

      <template v-else>
        <OrganismsEmployeeCodeEntry
          v-model="employeeCode"
          :office-name="employeeOffice.name"
          :searching="officeDesk.searching.value"
          :error="officeDesk.searchError.value"
          :notice="officeDesk.notice.value"
          @complete="searchOrderCode"
        />

        <OrganismsEmployeePendingOrders
          :state="officeDesk.pendingState.value"
          :orders="officeDesk.pendingOrders.value"
          @open="officeDesk.open($event)"
        />

        <AtomsMiniAppButton
          v-if="!employee.passwordSet"
          variant="secondary"
          :label="EMPLOYEE_PASSWORD_LABEL"
          @click="openEmployeePassword"
        />
      </template>

      <div v-if="employeeCanGoBack">
        <AtomsMiniAppButton variant="secondary" label="Назад" @click="employeeBack" />
      </div>
    </div>

    <template v-else-if="stage === 'member' && member">
      <!-- Аватар ничего не открывает: профиль подключает своя задача -->
      <OrganismsNextMemberHome
        v-if="currentScreen === 'home' && homeView"
        v-bind="homeView"
        @exchange="openExchange"
        @orders="openOrders"
        @order="openOrder"
        @rewards="openRewards"
        @reward="openReward"
        @history="openHistory"
        @retry-orders="memberOrders.loadOrders()"
        @retry-rewards="memberRewards.load()"
        @retry-history="memberHistory.loadFirstPage()"
      />

      <OrganismsNextMemberHistoryScreen
        v-else-if="currentScreen === 'history' && historyScreenView"
        v-bind="historyScreenView"
        @back="goBack"
        @more="memberHistory.loadMore()"
        @retry="memberHistory.loadFirstPage()"
      />

      <OrganismsNextMemberOrdersScreen
        v-else-if="currentScreen === 'orders' && ordersScreen"
        v-bind="ordersScreen"
        @back="goBack"
        @open="openOrder"
        @retry="memberOrders.loadOrders()"
      />

      <template v-else-if="currentScreen === 'order' && orderScreen">
        <OrganismsNextMemberOrderScreen
          :order="orderScreen.order"
          :balance="orderScreen.balance"
          :texts="orderScreen.texts"
          @back="goBack"
          @map="openOrderMap"
          @cancel="askCancelOrder"
        />
        <OrganismsNextMemberCancelOrderSheet
          :open="cancelSheetOpen"
          :busy="memberOrders.cancelling.value"
          :error="memberOrders.cancelError.value ?? undefined"
          :texts="orderScreen.sheetTexts"
          @confirm="cancelCurrentOrder"
          @cancel="closeCancelSheet"
        />
      </template>

      <OrganismsNextMemberRewardsScreen
        v-else-if="currentScreen === 'rewards' && rewardsScreen"
        v-bind="rewardsScreen"
        @back="goBack"
        @open="openReward"
        @retry="memberRewards.load()"
      />

      <OrganismsNextMemberRewardScreen
        v-else-if="currentScreen === 'reward' && rewardScreen"
        :reward="rewardScreen.reward"
        :texts="rewardScreen.texts"
        @back="goBack"
        @map="openRewardMap"
      />

      <div v-else class="flex flex-col gap-2">
        <OrganismsMemberOfficePicker
          v-if="currentScreen === 'offices'"
          :state="memberOrders.officesState.value"
          :offices="memberOrders.offices.value"
          :texts="member.orderTexts"
          @select="selectOffice"
        />

        <OrganismsOfficeShowcase
          v-else-if="currentScreen === 'showcase'"
          :state="memberOrders.showcaseState.value"
          :showcase="memberOrders.showcase.value"
          :error-message="memberOrders.showcaseError.value"
          :quantities="memberOrders.quantities.value"
          :total="memberOrders.cartTotal.value"
          :texts="member.orderTexts"
          @increment="changeQuantity($event, 1)"
          @decrement="changeQuantity($event, -1)"
          @checkout="openConfirm"
        />

        <OrganismsOrderConfirmation
          v-else-if="currentScreen === 'confirm' && memberOrders.showcase.value"
          :office="memberOrders.showcase.value.office"
          :lines="memberOrders.cartLines.value"
          :total="memberOrders.cartTotal.value"
          :placing="memberOrders.placing.value"
          :error-message="memberOrders.placeError.value"
          :texts="member.orderTexts"
          @place="placeOrder"
          @edit="goBack"
        />

        <!-- «Назад» внизу — только у старых экранов: у новых он в шапке раздела -->
        <div class="pt-4">
          <AtomsMiniAppButton variant="secondary" :label="member.orderTexts.back" @click="goBack" />
        </div>
      </div>
    </template>

    <template v-else-if="(stage === 'registration' || stage === 'employee_denied') && currentTexts">
      <OrganismsNextMemberRegistrationOutcome
        v-if="outcome"
        v-bind="outcome"
        :language="language"
        @update:language="language = $event"
        @map="openMap"
        @send="share"
      />

      <OrganismsNextMemberRegistrationLanguage
        v-else-if="registrationStep === 'language' && welcome"
        :welcome="welcome"
        :select-language="currentTexts.selectLanguage"
        :language-uz="currentTexts.languageUz"
        :language-ru="currentTexts.languageRu"
        @select="selectLanguage"
      />

      <OrganismsNextMemberRegistrationPhone
        v-else
        :texts="currentTexts"
        :language="language"
        :checking="sending"
        @update:language="language = $event"
        @send="share"
      />
    </template>
  </NuxtLayout>
</template>
