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
  profileMock,
  promoHeroMock,
  campaignMock,
  dayChestsMock,
  bigChestMock,
  bigChestNote,
  loadFailedMock,
  notTelegramMock,
  outdatedTelegramMock,
  registrationLanguageMock,
  registrationOutcomeMock,
  registrationPhoneMock,
} from '~/design/mocks';
import type { RegistrationOutcomeScene } from '~/design/mocks';
import { findDesignScreen } from '~/design/screens';
import type { MemberChestCardView, MemberLanguage, MemberRewardTicketView } from '~/types/memberView';

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
  }),
);

const reward = computed(() =>
  pick({
    reward: rewardMock,
    'reward-custom': rewardCustomMock,
    'reward-issued': rewardIssuedMock,
    'reward-expired': rewardExpiredMock,
  }),
);

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

      <OrganismsNextMemberHome
        v-else-if="home"
        v-bind="home"
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

      <OrganismsNextMemberOrderScreen v-else-if="order" v-bind="order" @back="go('orders')" />

      <OrganismsNextMemberRewardScreen v-else-if="reward" v-bind="reward" @back="go('rewards')" />

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
