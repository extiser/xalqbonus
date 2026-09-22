<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDesignFonts } from '~/design/fonts';
import {
  homeErrorsMock,
  homeInviteMock,
  homeLoadingMock,
  homeMock,
  homeNewcomerMock,
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
  rewardsNothingToPickMock,
  ordersEmptyMock,
  ordersErrorMock,
  ordersMock,
  orderCancelledMock,
  orderExpiredMock,
  orderIssuedMock,
  orderMock,
  profileMock,
  promoHeroMock,
  campaignMock,
  dayChestsMock,
} from '~/design/mocks';
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
    'rewards-nothing': rewardsNothingToPickMock,
    'rewards-empty': rewardsEmptyMock,
    'rewards-error': rewardsErrorMock,
  }),
);

const orders = computed(() =>
  pick({
    orders: ordersMock,
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

function go(target: string): void {
  void navigateTo(`/design/${target}`);
}
</script>

<template>
  <div class="min-h-dvh bg-xb-screen font-manrope text-xb-text">
    <div class="mx-auto w-full max-w-[520px] bg-xb-screen">
      <OrganismsNextMemberHome
        v-if="home"
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

      <OrganismsNextMemberRewardsScreen v-else-if="rewards" v-bind="rewards" @back="go('home')" />

      <OrganismsNextMemberOrdersScreen v-else-if="orders" v-bind="orders" @back="go('home')" @open="openOrder" />

      <OrganismsNextMemberOrderScreen v-else-if="order" v-bind="order" @back="go('orders')" />

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

      <div v-else-if="slug === 'reward-tickets'" class="grid grid-cols-2 gap-x-6 gap-y-10 px-6 py-10">
        <MoleculesNextMemberRewardTicket v-for="ticket in REWARD_TICKETS" :key="ticket.tier" :ticket="ticket" />
      </div>

      <OrganismsNextMemberCampaignScreen v-else-if="campaign" v-bind="campaign" @profile="go('profile')" @chest="(chestId) => go(chestId === 'day' ? 'day-chests' : `big-chest-${chestId}`)" />
    </div>
  </div>
</template>
