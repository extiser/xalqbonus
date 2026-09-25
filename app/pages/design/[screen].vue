<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDesignFonts } from '~/design/fonts';
import {
  homeErrorsMock,
  homeInviteMock,
  homeLoadingMock,
  homeMock,
  homeNewcomerMock,
  homeQuietCancelledMock,
  homeQuietMock,
  homeSeveralMock,
  historyEmptyMock,
  historyErrorMock,
  historyLoadingMock,
  historyMock,
  historyMoreFailedMock,
  historyMoreLoadingMock,
  historyReasonsMock,
  rewardsEmptyMock,
  rewardsErrorMock,
  rewardsMock,
  rewardsNoPendingMock,
  rewardCustomMock,
  rewardExpiredMock,
  rewardIssuedMock,
  rewardMock,
  ordersEmptyMock,
  ordersErrorMock,
  ordersMock,
  ordersNoPendingMock,
  orderCancelledMock,
  orderExpiredMock,
  orderIssuedMock,
  orderMock,
  ORDER_CANCEL_DENIED,
  orderCancelSheetTexts,
  profileMock,
  promoHeroMock,
  campaignMock,
  dayChestsMock,
  bigChestMock,
  bigChestNote,
  GIFT_TAKE_ERROR,
  giftSheetMock,
  homeGiftsMock,
  rewardsGiftsMock,
  CATALOG_CURRENT_OFFICE,
  CATALOG_ORDER_DENIED,
  CATALOG_PICK_PRODUCT,
  catalogConfirmMock,
  catalogExitSheetTexts,
  catalogInitialCart,
  catalogNoOfficeMock,
  catalogOfficeSheetMock,
  catalogPickedConfirmMock,
  catalogPickedMock,
  catalogPickSheetMock,
  catalogShowcaseMock,
  catalogSoldOutSheetMock,
  loadFailedMock,
  notTelegramMock,
  outdatedTelegramMock,
  registrationLanguageMock,
  registrationOutcomeMock,
  registrationPhoneMock,
} from '~/design/mocks';
import type { CatalogCart, CatalogScene, GiftSheetScene, RegistrationOutcomeScene } from '~/design/mocks';
import { findDesignScreen } from '~/design/screens';
import type { MemberChestCardView, MemberGiftView, MemberLanguage, MemberRewardTicketView } from '~/types/memberView';

/**
 * Один экран служебной страницы `/design` — на заглушках, в колонке телефона.
 *
 * Колонка шириной во весь экран, но не шире 520 px, по центру и на фоне экрана — как в макетах:
 * на 16 Pro Max логическая ширина 440, 520 — запас сверху.
 *
 * Переходы между экранами работают ссылками на соседние адреса `/design`, переключатели
 * (шторки, глазик, язык) — локальным состоянием этой страницы: компоненты принимают готовое
 * и отдают события, помнить за них некому.
 */
if (!import.meta.dev) throw createError({ statusCode: 404 });

definePageMeta({ layout: false });

useDesignFonts();

const route = useRoute();
const slug = computed(() => String(route.params.screen));
const screen = computed(() => findDesignScreen(slug.value));

if (!screen.value) {
  throw createError({ statusCode: 404 });
}

useHead({ title: () => screen.value?.title ?? 'Макеты Mini App' });

/** Заглушка по адресу из набора одного экрана; адрес чужого экрана — ничего. */
function pick<Mock>(mocks: Record<string, Mock>): Mock | undefined {
  return Object.hasOwn(mocks, slug.value) ? mocks[slug.value] : undefined;
}

const home = computed(() =>
  pick({
    home: homeMock,
    'home-invite': homeInviteMock,
    'home-several': homeSeveralMock,
    'home-quiet': homeQuietMock,
    'home-quiet-cancelled': homeQuietCancelledMock,
    'home-newcomer': homeNewcomerMock,
    'home-loading': homeLoadingMock,
    'home-errors': homeErrorsMock,
  }),
);

const history = computed(() =>
  pick({
    history: historyMock,
    'history-reasons': historyReasonsMock,
    'history-empty': historyEmptyMock,
    'history-error': historyErrorMock,
    'history-loading': historyLoadingMock,
    'history-more-loading': historyMoreLoadingMock,
    'history-more-failed': historyMoreFailedMock,
  }),
);

const rewards = computed(() =>
  pick({
    rewards: rewardsMock,
    'rewards-nopending': rewardsNoPendingMock,
    'rewards-empty': rewardsEmptyMock,
    'rewards-error': rewardsErrorMock,
  }),
);

const orders = computed(() =>
  pick({
    orders: ordersMock,
    'orders-nopending': ordersNoPendingMock,
    'orders-empty': ordersEmptyMock,
    'orders-error': ordersErrorMock,
  }),
);

const order = computed(() =>
  pick({
    order: orderMock,
    'order-issued': orderIssuedMock,
    'order-cancelled': orderCancelledMock,
    'order-expired': orderExpiredMock,
    'order-cancel': orderMock,
    'order-cancel-busy': orderMock,
    'order-cancel-failed': orderMock,
  }),
);

/** Шторка отмены на экране заказа: открыта сразу на своих листах, у живого заказа — по кнопке. */
const orderCancelOpen = ref(slug.value.startsWith('order-cancel'));
const orderCancelBusy = slug.value === 'order-cancel-busy';
const orderCancelError = slug.value === 'order-cancel-failed' ? ORDER_CANCEL_DENIED : undefined;

const reward = computed(() =>
  pick({
    reward: rewardMock,
    'reward-custom': rewardCustomMock,
    'reward-issued': rewardIssuedMock,
    'reward-expired': rewardExpiredMock,
  }),
);

/**
 * Каталог: витрина сцены по адресу, поверх — шторка офиса или подтверждения. Корзину, офис
 * и отметку в шторке держит страница: счётчики, «Сменить», «Сохранить» и «Оформить» работают,
 * итог пересчитывается из корзины.
 */
const catalogScene = ref(
  pick<CatalogScene>({
    catalog: 'showcase',
    'catalog-nothing': 'nothing',
    'catalog-over-balance': 'overBalance',
    'catalog-stock-limit': 'stockLimit',
    'catalog-empty': 'empty',
    'catalog-error': 'error',
    'catalog-office': 'showcase',
    'catalog-office-other': 'showcase',
    'catalog-confirm': 'showcase',
    'catalog-confirm-placing': 'showcase',
    'catalog-confirm-denied': 'showcase',
  }),
);
const catalogOfficeId = ref<string>(CATALOG_CURRENT_OFFICE);
const catalogCart = ref<CatalogCart>(catalogScene.value ? catalogInitialCart(catalogScene.value) : {});
const catalogSheet = ref<'none' | 'office' | 'confirm'>(
  pick<'office' | 'confirm'>({
    'catalog-office': 'office',
    'catalog-office-other': 'office',
    'catalog-confirm': 'confirm',
    'catalog-confirm-placing': 'confirm',
    'catalog-confirm-denied': 'confirm',
  }) ?? 'none',
);
/** Отметка в шторке офиса: на текущем офисе, на `catalog-office-other` — Сергели. */
const catalogSelected = ref<string | null>(slug.value === 'catalog-office-other' ? 'sergeli' : catalogOfficeId.value);
const catalogPlacing = ref(slug.value === 'catalog-confirm-placing');
const catalogDenied = slug.value === 'catalog-confirm-denied' ? CATALOG_ORDER_DENIED : undefined;

const catalogShowcase = computed(() =>
  catalogScene.value ? catalogShowcaseMock(catalogScene.value, catalogCart.value, catalogOfficeId.value) : undefined,
);
const catalogConfirm = computed(() =>
  catalogScene.value ? catalogConfirmMock(catalogScene.value, catalogCart.value, catalogOfficeId.value) : undefined,
);
const catalogCartFilled = computed(() => Object.keys(catalogCart.value).length > 0);

/** Счётчик на плитке или в шторке: не больше остатка, до нуля — товар уходит из корзины. */
function changeCatalogCount(productId: string, delta: number): void {
  const available = catalogShowcase.value?.products.find((product) => product.id === productId)?.available ?? 0;
  const count = Math.min((catalogCart.value[productId] ?? 0) + delta, available);
  const { [productId]: _removed, ...rest } = catalogCart.value;

  catalogCart.value = count > 0 ? { ...rest, [productId]: count } : rest;

  // Ушла последняя строка подтверждения — шторка закрывается, водитель на витрине.
  if (catalogSheet.value === 'confirm' && count <= 0 && Object.keys(catalogCart.value).length === 0) {
    catalogSheet.value = 'none';
  }
}

function openCatalogOffices(): void {
  catalogSelected.value = catalogOfficeId.value;
  catalogSheet.value = 'office';
}

/** Другой офис — корзина очищается: в другом офисе свой набор. */
function saveCatalogOffice(officeId: string): void {
  if (officeId !== catalogOfficeId.value) {
    catalogCart.value = {};
  }

  catalogOfficeId.value = officeId;
  catalogSheet.value = 'none';
}

/**
 * Каталог без офиса на входе (T70, issue #234): каталог без офиса, шторка «Где заберёте?» с первого
 * «+» и со ссылки «Выбрать», витрина выбранного офиса с приглушёнными и подсказкой, шторка выхода.
 * Путь работает целиком: «+» спрашивает офис, «Добавить в корзину» закрепляет его, «Назад» с корзиной
 * спрашивает, уходить ли.
 */
type NoOfficeSetup = {
  officeId: string | null;
  sheet: 'none' | 'office' | 'exit';
  officeView: 'add' | 'soldOut' | 'pick' | 'change';
  cart: CatalogCart;
  hint: boolean;
};

const noOffice = pick<NoOfficeSetup>({
  'catalog-no-office': { officeId: null, sheet: 'none', officeView: 'add', cart: {}, hint: false },
  'catalog-pick-office': { officeId: null, sheet: 'office', officeView: 'add', cart: {}, hint: false },
  'catalog-pick-office-sold-out': { officeId: null, sheet: 'office', officeView: 'soldOut', cart: {}, hint: false },
  'catalog-office-picked': { officeId: CATALOG_CURRENT_OFFICE, sheet: 'none', officeView: 'change', cart: { checker: 1 }, hint: true },
  'catalog-exit': { officeId: CATALOG_CURRENT_OFFICE, sheet: 'exit', officeView: 'change', cart: { checker: 1 }, hint: false },
});

const noOfficeId = ref<string | null>(noOffice?.officeId ?? null);
const noOfficeSheet = ref<'none' | 'office' | 'confirm' | 'exit'>(noOffice?.sheet ?? 'none');
const noOfficeView = ref<NoOfficeSetup['officeView']>(noOffice?.officeView ?? 'add');
const noOfficeCart = ref<CatalogCart>({ ...(noOffice?.cart ?? {}) });
const noOfficeHint = ref(noOffice?.hint ?? false);
const noOfficeProduct = ref<string>(CATALOG_PICK_PRODUCT);
const noOfficeSelected = ref<string | null>(null);

const noOfficeScreen = computed(() => {
  if (!noOffice) {
    return undefined;
  }

  return noOfficeId.value === null ? catalogNoOfficeMock() : catalogPickedMock(noOfficeId.value, noOfficeCart.value, noOfficeHint.value);
});

const noOfficeSheetView = computed(() => {
  switch (noOfficeView.value) {
    case 'add':
      return catalogPickSheetMock(noOfficeProduct.value);
    case 'soldOut':
      return catalogSoldOutSheetMock;
    case 'pick':
      return catalogPickSheetMock(null);
    case 'change':
      return {
        ...catalogOfficeSheetMock,
        current: noOfficeId.value,
        cartFilled: Object.keys(noOfficeCart.value).length > 0,
      };
  }
});

const noOfficeConfirm = computed(() =>
  noOfficeId.value === null ? undefined : catalogPickedConfirmMock(noOfficeId.value, noOfficeCart.value),
);

/** «+» без офиса открывает шторку «Где заберёте?», с офисом — прибавляет в пределах остатка. */
function changeNoOfficeCount(productId: string, delta: number): void {
  if (noOfficeId.value === null) {
    if (delta > 0) {
      noOfficeProduct.value = productId;
      noOfficeView.value = 'add';
      noOfficeSelected.value = null;
      noOfficeSheet.value = 'office';
    }

    return;
  }

  const screenView = noOfficeScreen.value;
  const available = screenView?.products.find((product) => product.id === productId)?.available ?? 0;
  const count = Math.min((noOfficeCart.value[productId] ?? 0) + delta, available);
  const { [productId]: _removed, ...rest } = noOfficeCart.value;

  noOfficeCart.value = count > 0 ? { ...rest, [productId]: count } : rest;

  if (noOfficeSheet.value === 'confirm' && Object.keys(noOfficeCart.value).length === 0) {
    noOfficeSheet.value = 'none';
  }
}

/** Ссылка в строке офиса: «Выбрать» — все офисы, «Сменить» — шторка смены. */
function openNoOfficeLine(): void {
  noOfficeView.value = noOfficeId.value === null ? 'pick' : 'change';
  noOfficeSelected.value = noOfficeId.value;
  noOfficeHint.value = false;
  noOfficeSheet.value = 'office';
}

function saveNoOfficeSheet(officeId: string): void {
  const view = noOfficeView.value;

  if (view === 'add' || view === 'soldOut') {
    noOfficeCart.value = { [noOfficeProduct.value]: 1 };
    noOfficeHint.value = true;
  } else if (view === 'pick') {
    noOfficeCart.value = {};
    noOfficeHint.value = true;
  } else if (officeId !== noOfficeId.value) {
    noOfficeCart.value = {};
  }

  noOfficeId.value = officeId;
  noOfficeSheet.value = 'none';
}

/** «Назад» с корзиной — шторка выхода, без неё — главная. */
function leaveNoOffice(): void {
  if (Object.keys(noOfficeCart.value).length > 0) {
    noOfficeHint.value = false;
    noOfficeSheet.value = 'exit';

    return;
  }

  go('home');
}

/** Заказ оформляется столько же, сколько проверяется номер, и открывается экран заказа. */
function placeCatalogOrder(): void {
  catalogPlacing.value = true;
  setTimeout(() => go('order'), PHONE_CHECK_MS);
}

/**
 * Подарки: главная со шторкой и «Мои награды» с группой. Страница отвечает за сервер — «Забрать»
 * ждёт 0.9 с, как в скрипте `main-screen-gifts-take.html`, и решает исход каждого подарка; компоненты
 * только рисуют ожидание, лопание и ошибку. Главная сцены — та же, что под шторкой, со шторкой
 * закрытой: нажатие на подарок открывает её на месте.
 */
const giftScene = pick<{ scene: GiftSheetScene; open: boolean }>({
  'gifts-home-one': { scene: 'one', open: false },
  'gifts-home': { scene: 'several', open: false },
  'gifts-sheet-one': { scene: 'one', open: true },
  'gifts-sheet': { scene: 'several', open: true },
  'gifts-take': { scene: 'take', open: true },
});
const giftSheet = giftScene ? giftSheetMock(giftScene.scene) : undefined;
const isGiftRewards = slug.value === 'gifts-rewards';

const GIFT_ANSWER_MS = 900;
const GIFT_TAKE_ALL_STEP_MS = 480;

const giftSheetOpen = ref(giftScene?.open ?? false);
const giftHome = ref<MemberGiftView[]>(giftSheet?.home ?? []);
const giftList = ref<MemberGiftView[]>(isGiftRewards ? rewardsGiftsMock.gifts : (giftSheet?.sheet ?? []));
const giftBusy = ref<string[]>([]);
const giftPopping = ref<string[]>([]);
const giftErrors = ref<Record<string, string>>({});
const giftTakingAll = ref(false);
/** Подарки, которые с первого раза не забираются; после ошибки забираются. */
const giftFailOnce = new Set(giftSheet?.failOnce ?? []);

function clearGiftError(giftId: string): void {
  const { [giftId]: _cleared, ...rest } = giftErrors.value;
  giftErrors.value = rest;
}

/** Ответ на один подарок: не забрался — ошибка под карточкой, забрался — лопается. */
function answerGift(giftId: string): void {
  if (giftFailOnce.delete(giftId)) {
    giftErrors.value = { ...giftErrors.value, [giftId]: GIFT_TAKE_ERROR };
    return;
  }

  giftPopping.value = [...giftPopping.value, giftId];
}

function takeGift(giftId: string): void {
  clearGiftError(giftId);
  giftBusy.value = [...giftBusy.value, giftId];
  setTimeout(() => {
    giftBusy.value = giftBusy.value.filter((busyId) => busyId !== giftId);
    answerGift(giftId);
  }, GIFT_ANSWER_MS);
}

/** «Забрать всё»: у каждого подарка свой исход, забранные лопаются по очереди. */
function takeAllGifts(): void {
  giftErrors.value = {};
  giftTakingAll.value = true;
  setTimeout(() => {
    giftTakingAll.value = false;
    const live = giftList.value.filter((gift) => !giftPopping.value.includes(gift.id)).map((gift) => gift.id);
    const failed = live.filter((giftId) => giftFailOnce.has(giftId));
    const taken = live.filter((giftId) => !giftFailOnce.has(giftId));

    failed.forEach(answerGift);
    taken.forEach((giftId, index) => setTimeout(() => answerGift(giftId), index * GIFT_TAKE_ALL_STEP_MS));
  }, GIFT_ANSWER_MS);
}

/** Место схлопнулось — подарка больше нет ни в шторке, ни на главной. */
function removeGift(giftId: string): void {
  giftList.value = giftList.value.filter((gift) => gift.id !== giftId);
  giftHome.value = giftHome.value.filter((gift) => gift.id !== giftId);
  giftPopping.value = giftPopping.value.filter((poppingId) => poppingId !== giftId);
  clearGiftError(giftId);
}

function openGiftSheet(): void {
  if (giftList.value.length > 0) {
    giftSheetOpen.value = true;
  }
}

// Загрузка: уход включает кнопка страницы. После `left` блока нет — «Показать снова» монтирует
// экран заново, и вход проигрывается ещё раз.
const loadingLeaving = ref(false);
const loadingLeft = ref(false);
const loadingKey = ref(0);

function toggleLoading(): void {
  if (!loadingLeft.value) {
    loadingLeaving.value = true;
    return;
  }

  loadingKey.value += 1;
  loadingLeaving.value = false;
  loadingLeft.value = false;
}

const stub = computed(() =>
  pick({
    'app-load-failed': loadFailedMock,
    'app-not-telegram': notTelegramMock,
    'app-outdated-telegram': outdatedTelegramMock,
  }),
);

// Регистрация: язык один на весь поток — выбран на шаге 1 и переживает переход между экранами.
const registrationLanguage = useState<MemberLanguage>('design-registration-language', () => 'ru');

function selectLanguage(language: MemberLanguage): void {
  registrationLanguage.value = language;
  go('registration-phone');
}

// Проверка номера длится 3 с, как в макете; экраны «проверяем» стоят в ней всё время.
const PHONE_CHECK_MS = 3000;
const isCheckingScreen = slug.value.endsWith('-checking');
const phoneChecking = ref(isCheckingScreen);

function checkPhone(): void {
  phoneChecking.value = true;
  setTimeout(() => {
    phoneChecking.value = isCheckingScreen;
  }, PHONE_CHECK_MS);
}

const registrationPhone = computed(() =>
  slug.value.startsWith('registration-phone') ? registrationPhoneMock(registrationLanguage.value) : undefined,
);

const outcome = computed(() => {
  const scene = pick<RegistrationOutcomeScene>({
    'registration-refused': 'refused',
    'registration-retry': 'retry',
    'registration-retry-checking': 'retry',
    'registration-employee': 'employee',
    'registration-employee-denied': 'employeeDenied',
  });

  return scene ? registrationOutcomeMock(scene, registrationLanguage.value) : undefined;
});

// Профиль: глазик, открытая шторка и язык живут здесь, компонент только рисует их.
const licenseRevealed = ref(false);
const profileSheet = ref<'none' | 'reset' | 'language'>(
  slug.value === 'profile-language' ? 'language' : slug.value === 'profile-reset' ? 'reset' : 'none',
);
const profileLanguage = ref<MemberLanguage>('ru');
const isProfile = computed(() => slug.value.startsWith('profile'));
const profile = computed(() => profileMock(profileLanguage.value));

function saveLanguage(language: MemberLanguage): void {
  profileLanguage.value = language;
  profileSheet.value = 'none';
}

/**
 * Экран участника: `campaign` — снимок макета, `campaign-{heat|week|chests}-{N}` — тот же экран,
 * где одна часть подменена сценой N своего листа.
 */
const campaign = computed(() => {
  if (slug.value === 'campaign') {
    return campaignMock();
  }

  const match = /^campaign-(heat|week|chests)-(\d+)$/.exec(slug.value);

  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  return campaignMock({ [match[1]]: Number(match[2]) - 1 });
});

// Шторка «Сундуки дня» над экраном участника: карточки живут здесь — открытый сундук
// становится открытым по «Готово», как это сделал бы ответ сервера.
const dayChestsMatch = /^day-chests(?:-(\d+))?$/.exec(slug.value);
const dayChests = dayChestsMatch ? dayChestsMock(dayChestsMatch[1] ? Number(dayChestsMatch[1]) - 1 : 1) : undefined;
const dayChestCards = ref<MemberChestCardView[]>(dayChests?.cards ?? []);
const sheetOpen = ref(true);

function markOpened(cardId: string): void {
  dayChestCards.value = dayChestCards.value.map((card) =>
    card.id === cardId ? { id: card.id, state: 'open', label: 'открыт' } : card,
  );
}

// Шторка крупного сундука: после «Готово» сундук становится открытым — как после ответа сервера.
const bigChestMatch = /^big-chest-(3days|week)(?:-(\d+))?$/.exec(slug.value);
const bigChestKind = bigChestMatch?.[1] === 'week' ? 'week' : '3days';
const bigChest = bigChestMatch ? bigChestMock(bigChestKind, bigChestMatch[2] ? Number(bigChestMatch[2]) - 1 : 3) : undefined;
const bigChestState = ref(bigChest?.state ?? 'locked');
const bigChestTexts = computed(() =>
  bigChest ? { ...bigChest.texts, ...bigChestNote(bigChestKind, bigChestState.value) } : undefined,
);

/** Лист ступеней карточки награды — все четыре металла рядом. */
const REWARD_TICKETS: MemberRewardTicketView[] = [
  { tier: 'steel', stub: 'Сундук дня', title: '+53 балла', subtitle: 'уже на балансе' },
  { tier: 'bronze', stub: 'Сундук дня', title: '+132 балла', subtitle: 'уже на балансе' },
  { tier: 'silver', stub: 'Сундук дня', title: '+263 балла', subtitle: 'уже на балансе' },
  { tier: 'gold', stub: 'Сундук дня', title: '+526 баллов', subtitle: 'уже на балансе' },
];

/** Экран заказа по номеру: у каждого нарисованного заказа своё состояние экрана. */
const ORDER_SCREENS: Record<string, string> = {
  '1042': 'order',
  '1039': 'order-issued',
  '1031': 'order-cancelled',
  '1024': 'order-expired',
};

function openOrder(orderId: string): void {
  go(ORDER_SCREENS[orderId] ?? 'order');
}

/**
 * Экран награды по карточке раздела: у нарисованных наград своё состояние экрана,
 * у второй ждущей своего экрана в макетах нет — открывается тот же, что у первой.
 */
const REWARD_SCREENS: Record<string, string> = {
  'reward-checker': 'reward',
  'reward-freshener': 'reward-issued',
  'reward-aroma': 'reward-expired',
};

function openReward(rewardId: string): void {
  go(REWARD_SCREENS[rewardId] ?? 'reward');
}

function go(target: string): void {
  void navigateTo(`/design/${target}`);
}
</script>

<template>
  <div class="min-h-dvh bg-xb-screen font-manrope text-xb-text">
    <div class="mx-auto w-full max-w-[520px] bg-xb-screen">
      <template v-if="slug === 'app-loading'">
        <OrganismsNextMemberLoadingScreen :key="loadingKey" :leaving="loadingLeaving" @left="loadingLeft = true" />
        <div class="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(24px+env(safe-area-inset-bottom))]">
          <AtomsNextMemberButton size="s" tone="outline" :disabled="loadingLeaving && !loadingLeft" @click="toggleLoading">
            {{ loadingLeft ? 'Показать снова' : 'Уйти' }}
          </AtomsNextMemberButton>
        </div>
      </template>

      <OrganismsNextMemberStubScreen v-else-if="stub" v-bind="stub" @retry="go('app-loading')" />

      <OrganismsNextMemberRegistrationLanguage
        v-else-if="slug === 'registration-language'"
        v-bind="registrationLanguageMock"
        @select="selectLanguage"
      />

      <OrganismsNextMemberRegistrationPhone
        v-else-if="registrationPhone"
        v-bind="registrationPhone"
        v-model:language="registrationLanguage"
        :checking="phoneChecking"
        @send="checkPhone"
      />

      <OrganismsNextMemberRegistrationOutcome
        v-else-if="outcome"
        v-bind="outcome"
        v-model:language="registrationLanguage"
        :busy="phoneChecking"
        @send="checkPhone"
      />

      <template v-else-if="giftSheet">
        <OrganismsNextMemberHome
          v-bind="homeGiftsMock(giftHome)"
          @gift="openGiftSheet"
          @rewards="go('gifts-rewards')"
          @reward="go('gifts-rewards')"
          @catalog="go('catalog-no-office')"
          @product="go('catalog-no-office')"
          @history="go('history')"
          @orders="go('orders')"
          @order="openOrder"
          @profile="go('profile')"
          @promo="go('campaign')"
        />
        <OrganismsNextMemberGiftSheet
          :open="giftSheetOpen"
          :gifts="giftList"
          :busy="giftBusy"
          :popping="giftPopping"
          :errors="giftErrors"
          :taking-all="giftTakingAll"
          :texts="giftSheet.texts"
          @take="takeGift"
          @take-all="takeAllGifts"
          @popped="removeGift"
          @close="giftSheetOpen = false"
        />
      </template>

      <OrganismsNextMemberRewardsScreen
        v-else-if="isGiftRewards"
        v-bind="rewardsGiftsMock"
        :gifts="giftList"
        :gifts-busy="giftBusy"
        :gifts-popping="giftPopping"
        :gift-errors="giftErrors"
        @back="go('gifts-home')"
        @open="openReward"
        @take="takeGift"
        @popped="removeGift"
      />

      <OrganismsNextMemberHome
        v-else-if="home"
        v-bind="home"
        @catalog="go('catalog-no-office')"
        @product="go('catalog-no-office')"
        @history="go('history')"
        @rewards="go('rewards')"
        @reward="go('rewards')"
        @orders="go('orders')"
        @order="openOrder"
        @profile="go('profile')"
        @invite="go('promo')"
        @promo="go('campaign')"
      />

      <OrganismsNextMemberHistoryScreen v-else-if="history" v-bind="history" @back="go('home')" />

      <OrganismsNextMemberRewardsScreen v-else-if="rewards" v-bind="rewards" @back="go('home')" @open="openReward" />

      <OrganismsNextMemberOrdersScreen v-else-if="orders" v-bind="orders" @back="go('home')" @open="openOrder" />

      <template v-else-if="order">
        <OrganismsNextMemberOrderScreen v-bind="order" @back="go('orders')" @cancel="orderCancelOpen = true" />
        <OrganismsNextMemberCancelOrderSheet
          :open="orderCancelOpen"
          :busy="orderCancelBusy"
          :error="orderCancelError"
          :texts="orderCancelSheetTexts"
          @confirm="go('order-cancelled')"
          @cancel="orderCancelOpen = false"
        />
      </template>

      <OrganismsNextMemberRewardScreen v-else-if="reward" v-bind="reward" @back="go('rewards')" />

      <template v-else-if="noOfficeScreen">
        <OrganismsNextMemberShowcaseScreen
          v-bind="noOfficeScreen"
          @back="leaveNoOffice"
          @change="openNoOfficeLine"
          @inc="(productId) => changeNoOfficeCount(productId, 1)"
          @dec="(productId) => changeNoOfficeCount(productId, -1)"
          @checkout="noOfficeSheet = 'confirm'"
          @hint-close="noOfficeHint = false"
        />
        <OrganismsNextMemberOfficeSheet
          :open="noOfficeSheet === 'office'"
          v-bind="noOfficeSheetView"
          :selected="noOfficeSelected"
          @select="(officeId) => (noOfficeSelected = officeId)"
          @save="saveNoOfficeSheet"
          @cancel="noOfficeSheet = 'none'"
        />
        <OrganismsNextMemberConfirmSheet
          v-if="noOfficeConfirm"
          :open="noOfficeSheet === 'confirm'"
          v-bind="noOfficeConfirm"
          :busy="catalogPlacing"
          @inc="(lineId) => changeNoOfficeCount(lineId, 1)"
          @dec="(lineId) => changeNoOfficeCount(lineId, -1)"
          @place="placeCatalogOrder"
          @cancel="noOfficeSheet = 'none'"
        />
        <OrganismsNextMemberCatalogExitSheet
          :open="noOfficeSheet === 'exit'"
          :texts="catalogExitSheetTexts"
          @stay="noOfficeSheet = 'none'"
          @exit="go('home')"
        />
      </template>

      <template v-else-if="catalogShowcase && catalogConfirm">
        <OrganismsNextMemberShowcaseScreen
          v-bind="catalogShowcase"
          @back="go('home')"
          @change="openCatalogOffices"
          @inc="(productId) => changeCatalogCount(productId, 1)"
          @dec="(productId) => changeCatalogCount(productId, -1)"
          @checkout="catalogSheet = 'confirm'"
        />
        <OrganismsNextMemberOfficeSheet
          :open="catalogSheet === 'office'"
          v-bind="catalogOfficeSheetMock"
          :current="catalogOfficeId"
          :selected="catalogSelected"
          :cart-filled="catalogCartFilled"
          @select="(officeId) => (catalogSelected = officeId)"
          @save="saveCatalogOffice"
          @cancel="catalogSheet = 'none'"
        />
        <OrganismsNextMemberConfirmSheet
          :open="catalogSheet === 'confirm'"
          v-bind="catalogConfirm"
          :busy="catalogPlacing"
          :error="catalogDenied"
          @inc="(lineId) => changeCatalogCount(lineId, 1)"
          @dec="(lineId) => changeCatalogCount(lineId, -1)"
          @place="placeCatalogOrder"
          @cancel="catalogSheet = 'none'"
        />
      </template>

      <OrganismsNextMemberProfileScreen
        v-else-if="isProfile"
        v-bind="profile"
        :license-revealed="licenseRevealed"
        :sheet="profileSheet"
        @back="go('home')"
        @toggle-license="licenseRevealed = !licenseRevealed"
        @open-language="profileSheet = 'language'"
        @ask-reset="profileSheet = 'reset'"
        @reset="profileSheet = 'none'"
        @close="profileSheet = 'none'"
        @save="saveLanguage"
      />

      <OrganismsNextMemberPromoHero
        v-else-if="slug === 'promo'"
        v-bind="promoHeroMock"
        @accept="go('campaign')"
        @decline="go('home-invite')"
      />

      <template v-else-if="dayChests">
        <OrganismsNextMemberCampaignScreen v-bind="campaignMock()" @chest="sheetOpen = true" />
        <OrganismsNextMemberDayChestsSheet
          :open="sheetOpen"
          :cards="dayChestCards"
          :ticket="dayChests.ticket"
          :texts="dayChests.texts"
          @close="sheetOpen = false"
          @done="markOpened"
          @link="go('rewards')"
        />
      </template>

      <template v-else-if="bigChest && bigChestTexts">
        <OrganismsNextMemberCampaignScreen v-bind="campaignMock()" @chest="sheetOpen = true" />
        <OrganismsNextMemberBigChestSheet
          :open="sheetOpen"
          :kind="bigChest.kind"
          :state="bigChestState"
          :ticket="bigChest.ticket"
          :texts="bigChestTexts"
          @close="sheetOpen = false"
          @done="bigChestState = 'opened'"
          @link="go('rewards')"
        />
      </template>

      <div v-else-if="slug === 'reward-tickets'" class="grid grid-cols-2 gap-x-6 gap-y-10 px-6 py-10">
        <MoleculesNextMemberRewardTicket v-for="ticket in REWARD_TICKETS" :key="ticket.tier" :ticket="ticket" />
      </div>

      <OrganismsNextMemberCampaignScreen v-else-if="campaign" v-bind="campaign" @profile="go('profile')" @chest="(chestId) => go(chestId === 'day' ? 'day-chests' : `big-chest-${chestId}`)" />
    </div>
  </div>
</template>
