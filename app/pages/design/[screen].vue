<script setup lang="ts">
import { computed } from 'vue';
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
} from '~/design/mocks';
import { findDesignScreen } from '~/design/screens';

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
    </div>
  </div>
</template>
