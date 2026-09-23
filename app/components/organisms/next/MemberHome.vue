<script setup lang="ts">
import type {
  MemberOperationDayView,
  MemberOrderRowView,
  MemberRewardView,
  MemberViewLoad,
} from '~/types/memberView';

/**
 * Главный экран водителя — `product/design/app/main-screen.html` и `main-screen-invite.html`.
 *
 * Сверху живой фон, шапка и баллы; под баллами — плашка приглашения, если водитель попал
 * в снимок акции и не вступил. Дальше блоки в порядке срочности: заказы (живут сутки),
 * награды (недели), история. Заказы выше наград — первым говорит то, что горит.
 *
 * Каталога и блока HOT здесь нет: каталог не нарисован, они придут своей задачей.
 */
const props = defineProps<{
  name: string;
  callsign?: string;
  points: number;
  /** Прогресс акции в шапке. Нет — водитель не в акции. */
  promo?: { done: number; total: number };
  /** Плашка приглашения. Есть — водитель в снимке акции, но не вступил. */
  invite?: { kicker: string; title: string; when: string };
  orders: { state: MemberViewLoad; items: MemberOrderRowView[] };
  rewards: { state: MemberViewLoad; items: MemberRewardView[] };
  history: { state: MemberViewLoad; days: MemberOperationDayView[] };
  texts: {
    profile: string;
    refresh: string;
    promo: string;
    balanceTitle: string;
    exchange: string;
    updated: string;
    ordersTitle: string;
    ordersAll: string;
    ordersError: string;
    rewardsTitle: string;
    rewardsAll: string;
    rewardsError: string;
    historyTitle: string;
    historyAll: string;
    historyEmpty: string;
    historyError: string;
    retry: string;
  };
}>();

defineEmits<{
  profile: [];
  refresh: [];
  promo: [];
  exchange: [];
  invite: [];
  orders: [];
  order: [orderId: string];
  rewards: [];
  reward: [rewardId: string];
  history: [];
  retryOrders: [];
  retryRewards: [];
  retryHistory: [];
}>();
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen font-manrope leading-[normal] text-xb-text">
    <div class="relative flex flex-col gap-[34px] overflow-hidden px-5 pt-[26px]" :class="props.invite ? 'pb-4' : 'pb-11'">
      <AtomsNextMemberLiveBackdrop />

      <OrganismsNextMemberHomeHeader
        :name="name"
        :callsign="callsign"
        :promo="promo"
        :texts="{ profile: texts.profile, refresh: texts.refresh, promo: texts.promo }"
        @profile="$emit('profile')"
        @refresh="$emit('refresh')"
        @promo="$emit('promo')"
      />

      <OrganismsNextMemberBalance
        :points="points"
        :texts="{ title: texts.balanceTitle, exchange: texts.exchange, updated: texts.updated }"
        @exchange="$emit('exchange')"
      />

      <MoleculesNextMemberInviteBanner
        v-if="props.invite"
        :kicker="props.invite.kicker"
        :title="props.invite.title"
        :when="props.invite.when"
        @open="$emit('invite')"
      />
    </div>

    <OrganismsNextMemberOrdersBlock
      :state="orders.state"
      :orders="orders.items"
      :texts="{ title: texts.ordersTitle, all: texts.ordersAll, error: texts.ordersError, retry: texts.retry }"
      @all="$emit('orders')"
      @open="(orderId) => $emit('order', orderId)"
      @retry="$emit('retryOrders')"
    />

    <OrganismsNextMemberRewardsBlock
      :state="rewards.state"
      :rewards="rewards.items"
      :texts="{ title: texts.rewardsTitle, all: texts.rewardsAll, error: texts.rewardsError, retry: texts.retry }"
      @all="$emit('rewards')"
      @open="(rewardId) => $emit('reward', rewardId)"
      @retry="$emit('retryRewards')"
    />

    <OrganismsNextMemberHistoryBlock
      :state="history.state"
      :days="history.days"
      :texts="{
        title: texts.historyTitle,
        all: texts.historyAll,
        empty: texts.historyEmpty,
        error: texts.historyError,
        retry: texts.retry,
      }"
      @all="$emit('history')"
      @retry="$emit('retryHistory')"
    />
  </div>
</template>
