<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  INIT_DATA_HEADER,
  type Language,
  type MemberOrder,
  type MiniAppEmployeeScreen,
  type MiniAppMemberScreen,
  type MiniAppRegisterResponse,
  type MiniAppStateResponse,
  type RegistrationScreenTexts,
} from '#shared/types/miniapp';
import { useMemberHistory } from '~/composables/useMemberHistory';
import { useMemberOrders } from '~/composables/useMemberOrders';
import { useOfficeOrderDesk } from '~/composables/useOfficeOrderDesk';
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

definePageMeta({ layout: 'miniapp' });

useHead({
  title: 'XalqBonus',
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

/**
 * Два текста, которых нет в серверном словаре, — и не по недосмотру: показываются они ровно
 * тогда, когда сервер не ответил или его не спрашивали вовсе. Спросить у него перевод
 * в этот момент не у кого.
 *
 * На двух языках сразу, как экран выбора языка в боте: чей это человек, мы здесь ещё
 * не знаем. Всё остальное, включая ответ устаревшему клиенту, приезжает с сервера
 * на языке водителя — к тому моменту экран регистрации уже загружен.
 */
const OPEN_FROM_TELEGRAM =
  'Ilovani Telegram orqali oching. / Откройте приложение через Telegram.';
const LOAD_FAILED =
  "Ma'lumotlarni yuklab bo'lmadi. Qaytadan urinib ko'ring. / Не удалось загрузить данные. Попробуйте ещё раз.";

/** Что показываем прямо сейчас. Загрузка и отказ различаются намеренно: они значат разное. */
type Stage = 'loading' | 'error' | 'member' | 'registration' | 'employee';

const stage = ref<Stage>('loading');
const errorMessage = ref('');

/** Экран участника: баланс, имя, отметка свежести и обещание бонуса новичку. */
const member = ref<MiniAppMemberScreen | null>(null);

const texts = ref<Record<Language, RegistrationScreenTexts> | null>(null);
const language = ref<Language>('ru');
const sending = ref(false);
const result = ref<MiniAppRegisterResponse | null>(null);

let webApp: TelegramWebApp | null = null;

/**
 * Подписанная строка этой загрузки страницы.
 *
 * Берётся не у объекта Telegram напрямую: после перезагрузки страницы адрес уже испорчен
 * роутером, SDK разбирает по нему огрызок, и личность в этот момент есть только в нашей
 * копии (`resolveInitData`, issue #105).
 */
let initData = '';

/** Перечитывание экрана кнопкой в пути: второе нажатие не отправляет тот же запрос дважды. */
const refreshing = ref(false);

/** Последнее обновление по кнопке не удалось. Снимается следующим удачным. */
const refreshFailed = ref(false);

/**
 * Сообщение об отказе обновления — тем же текстом, которым отвечает неудавшаяся история.
 *
 * Своего текста у отказа нет намеренно: по смыслу это то же самое — данные не прочитались,
 * попробуйте ещё раз, — а два текста про одно и то же однажды разойдутся.
 */
const refreshFailedNote = computed(() =>
  refreshFailed.value ? (member.value?.texts.historyFailed ?? null) : null,
);

/**
 * История участника. Своим запросом, а не полем экрана: экран читается один раз, а история
 * листается кнопкой, и пересобирать ради каждой страницы весь экран незачем.
 */
const memberHistory = useMemberHistory(() => initData);

/**
 * Обмен баллов: офисы, витрина, оформление и заказы. Запасной текст отказа — из текстов
 * экрана участника: к моменту первого запроса витрины они уже загружены.
 */
const memberOrders = useMemberOrders(
  () => initData,
  () => member.value?.orderTexts.requestFailed ?? LOAD_FAILED,
);

/**
 * Экран сотрудника: его офисы, выбранный офис и стойка выдачи.
 *
 * Своего пути по экранам у него нет: выбор офиса, стойка и карточка заказа выводятся
 * из состояния — выбран ли офис, открыт ли заказ, — и «назад» снимает ровно последнее из них.
 */
const employee = ref<MiniAppEmployeeScreen | null>(null);
const employeeOfficeId = ref<string | null>(null);
const employeeCode = ref('');

const officeDesk = useOfficeOrderDesk(() => ({ [INIT_DATA_HEADER]: initData }));

const employeeOffice = computed(
  () => employee.value?.offices.find((office) => office.officeId === employeeOfficeId.value) ?? null,
);

/** Есть ли куда вернуться: из карточки — к полю кода, от поля кода — к выбору из нескольких офисов. */
const employeeCanGoBack = computed(
  () =>
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

const issueEmployeeOrder = async (): Promise<void> => {
  await finishEmployeeAction((await officeDesk.issue()) !== null);
};

const cancelEmployeeOrder = async (): Promise<void> => {
  await finishEmployeeAction((await officeDesk.cancel()) !== null);
};

/**
 * Экраны участника.
 *
 * Переключаются внутри страницы, а не адресами: адрес Mini App несёт в хеше подписанную
 * строку, и роутер при переходе портит её (issue #90, #105). Шапки с навигацией нет —
 * «назад» делает системная кнопка Telegram (`layouts/miniapp.vue`).
 */
type MemberScreenName = 'home' | 'offices' | 'showcase' | 'confirm' | 'order' | 'orders';

/** Путь по экранам. Последний — показанный; «назад» снимает его. */
const screens = ref<MemberScreenName[]>(['home']);
const currentScreen = computed<MemberScreenName>(() => screens.value.at(-1) ?? 'home');

/** Заказ, открытый на экране заказа: только что оформленный или выбранный из списка. */
const currentOrder = ref<MemberOrder | null>(null);

/**
 * Есть ли у клиента системная кнопка «назад». Нет — экран рисует свою: без неё с витрины
 * не вернуться иначе как перезапуском приложения.
 */
const systemBack = ref(false);

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

  // Экран, на который вернулись, мог устареть: заказ отменили, баллы списались.
  if (currentScreen.value === 'home') {
    void refresh();
  } else if (currentScreen.value === 'orders') {
    void memberOrders.loadOrders();
  }
};

watch(currentScreen, (screen) => {
  // Новый экран открывается с начала, а не с той высоты, на которой листали прошлый.
  window.scrollTo(0, 0);

  if (screen === 'home') {
    webApp?.BackButton?.hide();
  } else {
    webApp?.BackButton?.show();
  }
});

watch(employeeCanGoBack, (canGoBack) => {
  if (stage.value !== 'employee') {
    return;
  }

  window.scrollTo(0, 0);

  if (canGoBack) {
    webApp?.BackButton?.show();
  } else {
    webApp?.BackButton?.hide();
  }
});

const openExchange = (): void => {
  openScreen('offices');
  void memberOrders.loadOffices();
};

const openOrders = (): void => {
  openScreen('orders');
  void memberOrders.loadOrders();
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
  // Назад с экрана оформленного заказа — на экран участника, а не в витрину: корзина пуста,
  // а подтверждать тот же заказ второй раз незачем.
  screens.value = ['home', 'order'];
  void refresh();
};

const openOrder = (order: MemberOrder): void => {
  currentOrder.value = order;
  memberOrders.resetCancelError();
  openScreen('order');
};

const cancelCurrentOrder = async (): Promise<void> => {
  const order = currentOrder.value;

  if (!order) {
    return;
  }

  const cancelled = await memberOrders.cancel(order.orderId);

  if (cancelled) {
    currentOrder.value = cancelled;
    void refresh();
  }
};

/**
 * Показывает то, что ответил сервер.
 *
 * Историю поднимает вызывающий, а не этот код: первая загрузка экрана и обновление
 * по кнопке читают её по-разному — с состоянием загрузки и тихо (issue #107).
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
    failWith(state.message);

    return;
  }

  texts.value = state.texts;
  language.value = state.language;
  stage.value = 'registration';
};

const failWith = (message: string): void => {
  errorMessage.value = message;
  stage.value = 'error';
};

/** Запрос состояния экрана. Один на первую загрузку и на кнопку обновления: спрашивается то же. */
const fetchState = (): Promise<MiniAppStateResponse> =>
  $fetch<MiniAppStateResponse>('/api/miniapp/me', {
    headers: { [INIT_DATA_HEADER]: initData },
  });

/** Спрашивает сервер, что показать этому человеку, и показывает. */
const loadState = async (): Promise<void> => {
  try {
    const state = await fetchState();

    applyState(state);

    if (state.screen === 'member') {
      // История догружается следом, своим состоянием: её отказ гасит список, а не экран
      // с балансом — баланс уже прочитан и врать о нём нечему.
      void memberHistory.loadFirstPage();
    }
  } catch (error) {
    // Текст на экране прежний — причина отказа водителю ничего не чинит. Но в консоли
    // она обязана быть: это единственное окно наружу, которое у Mini App есть, и без
    // записи `malformed` и `hash_mismatch` снаружи выглядят одинаково (issue #90).
    console.error('[miniapp] не удалось получить состояние экрана', error);
    failWith(LOAD_FAILED);
  }
};

/**
 * Перечитывает экран участника по кнопке: баланс, отметку свежести и первую страницу истории.
 *
 * Отдельно от `loadState`, потому что отказ здесь значит другое. При первой загрузке
 * показывать нечего, и отказ — это весь экран; при обновлении на экране уже стоит
 * прочитанный баланс, и увести его в красный текст значило бы стереть верные данные
 * в ответ на просьбу их обновить. Баланс, имя и отметка свежести поэтому остаются
 * прежними — они верные, и отметка честна: ничего не обновилось.
 *
 * Сказать об отказе при этом обязательно. Молчащая кнопка, которая покрутилась и погасла,
 * от неработающей неотличима, и следующим шагом человек идёт в меню Telegram к «Обновить
 * страницу» — ровно туда, откуда эта правка его уводит (issue #105).
 */
const refresh = async (): Promise<void> => {
  if (refreshing.value) {
    return;
  }

  refreshing.value = true;

  try {
    const state = await fetchState();

    applyState(state);

    if (state.screen === 'member') {
      // Тихо: строки истории стоят на экране, пока не пришли новые. Кнопка крутится,
      // и этого признака довольно — мигание списка им никогда не было (issue #107).
      await memberHistory.reloadFirstPage();
    }

    refreshFailed.value = false;
  } catch (error) {
    console.error('[miniapp] не удалось перечитать экран участника', error);
    refreshFailed.value = true;
  } finally {
    refreshing.value = false;
  }
};

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
    failWith(OPEN_FROM_TELEGRAM);

    return;
  }

  // Вызовы объекта, а не строки: после перезагрузки страницы личность приехала из копии,
  // а заставку убирает и окно разворачивает по-прежнему клиент Telegram.
  webApp?.ready();
  webApp?.expand();

  if (webApp?.BackButton) {
    webApp.BackButton.onClick(goBack);
    systemBack.value = true;
  }

  await loadState();
});

onBeforeUnmount(() => {
  webApp?.BackButton?.offClick(goBack);
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
      // участника отличался бы от всех последующих.
      await loadState();

      return;
    }

    result.value = response;
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
 * Нажатие «поделиться номером».
 *
 * Экран после нажатия не меняется и кнопка не гаснет. Причина не в удобстве: закрытие
 * системного окна свайпом не вызывает колбэк **вовсе** — ни ответа, ни события, — и любое
 * состояние ожидания здесь стало бы состоянием, из которого нет выхода (docs/miniapp.md).
 */
const share = (): void => {
  const requestContact = webApp?.requestContact;

  if (!requestContact) {
    // Клиент старее Bot API 6.9: вызова в объекте нет вовсе, и номер внутри приложения
    // взять нечем. Текст свой, а не «откройте приложение через Telegram»: человек уже
    // в Telegram, и по той подсказке ему делать нечего — чинится это обновлением клиента.
    //
    // Нажать кнопку можно только с экрана регистрации, а значит тексты уже загружены
    // и язык выбран: ответ идёт на нём, а не на двух сразу.
    failWith(texts.value?.[language.value].outdatedClient ?? OPEN_FROM_TELEGRAM);

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
</script>

<template>
  <p v-if="stage === 'loading'" class="py-10 text-center text-base text-slate-500">…</p>

  <p v-else-if="stage === 'error'" class="py-10 text-center text-base leading-relaxed text-red-700">
    {{ errorMessage }}
  </p>

  <div v-else-if="stage === 'employee' && employee" class="flex flex-col gap-6">
    <OrganismsEmployeeOfficePicker
      v-if="!employeeOffice"
      :full-name="employee.fullName"
      :offices="employee.offices"
      @select="selectEmployeeOffice"
    />

    <OrganismsEmployeeOrderCard
      v-else-if="officeDesk.current.value"
      :order="officeDesk.current.value"
      :acting="officeDesk.acting.value"
      :error="officeDesk.actionError.value"
      @issue="issueEmployeeOrder"
      @cancel="cancelEmployeeOrder"
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
    </template>

    <div v-if="employeeCanGoBack && !systemBack">
      <AtomsMiniAppButton variant="secondary" label="Назад" @click="employeeBack" />
    </div>
  </div>

  <div v-else-if="stage === 'member' && member" class="flex flex-col gap-2">
    <template v-if="currentScreen === 'home'">
      <OrganismsMemberSummary
        :balance-title="member.texts.balanceTitle"
        :balance="member.balance"
        :name="member.name"
        :updated-note="member.updatedNote"
        :promise="member.promise"
        :refresh-label="member.texts.refresh"
        :refreshing="refreshing"
        :refresh-failed-note="refreshFailedNote"
        :exchange-label="member.orderTexts.exchangePoints"
        :orders-label="member.orderTexts.myOrders"
        @refresh="refresh"
        @exchange="openExchange"
        @orders="openOrders"
      />

      <OrganismsMemberHistory
        :state="memberHistory.state.value"
        :operations="memberHistory.operations.value"
        :has-more="memberHistory.nextCursor.value !== null"
        :loading-more="memberHistory.loadingMore.value"
        :more-failed="memberHistory.moreFailed.value"
        :texts="member.texts"
        @more="memberHistory.loadMore()"
      />
    </template>

    <OrganismsMemberOfficePicker
      v-else-if="currentScreen === 'offices'"
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

    <OrganismsMemberOrderCard
      v-else-if="currentScreen === 'order' && currentOrder"
      :order="currentOrder"
      :cancelling="memberOrders.cancelling.value"
      :cancel-error="memberOrders.cancelError.value"
      :texts="member.orderTexts"
      @cancel="cancelCurrentOrder"
    />

    <OrganismsMemberOrderList
      v-else-if="currentScreen === 'orders'"
      :state="memberOrders.ordersState.value"
      :orders="memberOrders.orders.value"
      :texts="member.orderTexts"
      @open="openOrder"
    />

    <div v-if="currentScreen !== 'home' && !systemBack" class="pt-4">
      <AtomsMiniAppButton variant="secondary" :label="member.orderTexts.back" @click="goBack" />
    </div>
  </div>

  <OrganismsDriverRegistration
    v-else-if="texts"
    :texts="texts[language]"
    :language="language"
    :sending="sending"
    :result="result"
    @update:language="language = $event"
    @share="share"
  />
</template>
