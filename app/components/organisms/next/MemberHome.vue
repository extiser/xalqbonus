<script setup lang="ts">
import { ref } from 'vue';
import type { MemberSurveyTextPart } from '#shared/types/memberSurvey';
import type {
  MemberGiftView,
  MemberOperationDayView,
  MemberOrderRowView,
  MemberProductView,
  MemberRewardView,
  MemberViewLoad,
} from '~/types/memberView';

/**
 * Главный экран водителя — `_reference/design/home/main-screen.html` и `main-screen-invite.html`.
 *
 * Сверху липкая шапка, под ней живой фон и баллы; под баллами — плашка приглашения, если водитель
 * попал в снимок акции и не вступил, или плашка опроса (`_reference/design/survey/main-screen-survey*.html`,
 * issue #323) — на том же месте. Фон начинается от верха экрана и уходит под шапку. Дальше
 * блоки в порядке срочности: заказы (живут сутки), награды (недели), каталог, история. Заказы выше
 * наград — первым говорит то, что горит. Каталог — выше истории (`catalog-block.md`, «Место на главной»).
 * Подарки от Xalq Taxi — первыми карточками в блоке наград (`_reference/design/gifts/main-screen-gift.html`),
 * нажатие отдаётся наружу `gift`: шторку подарков держит страница.
 *
 * Каталога может не быть: без выбранного офиса товары главной пока не отдаёт ни одна ручка, и рабочее
 * приложение блок не показывает (issue #210). Нет `catalog` — нет блока, остальные на своих местах.
 * Подписи пилюли акции, подарков и каталога поэтому необязательны: у элемента, которого нет, подписывать
 * нечего.
 *
 * Число баллов набирается здесь, один раз на крупное и на баланс в шапке: они считаются вместе.
 *
 * Пока не выдан приветственный бонус, центр — слайдер (`_reference/design/home/main-screen-welcome.html`,
 * issue #410): первым экраном слайд бонуса «+300», вторым — баллы, как без слайдера. Пилюля в шапке
 * показывает другой слайд и листает на него. Нет `welcome` — центр как был, без точек и слайдера.
 * Номер слайда живёт здесь, а не в слайдере: его читает шапка.
 */
const props = defineProps<{
  name: string;
  callsign?: string;
  points: number;
  /** Прогресс акции в шапке. Нет — водитель не в акции. При `welcome` не показывается. */
  promo?: { done: number; total: number };
  /** Счёт до приветственного бонуса — слайд «+300». Нет — бонус выдан или не положен. */
  welcome?: {
    done: number;
    total: number;
    /** «+300». */
    amount: string;
    texts: { title: string; left: MemberSurveyTextPart[]; counted: string };
  };
  /** Плашка приглашения. Есть — водитель в снимке акции, но не вступил. */
  invite?: { kicker: string; title: string; when: string };
  /** Плашка опроса: «Опрос не закончен» или «Пройдите опрос». Нажатие отдаётся наружу `survey`. */
  survey?: { kicker: string; title: string; when: MemberSurveyTextPart[] };
  orders: { state: MemberViewLoad; items: MemberOrderRowView[] };
  rewards: { state: MemberViewLoad; items: MemberRewardView[]; gifts?: MemberGiftView[] };
  /** Блок каталога. Нет — блока нет. */
  catalog?: { state: MemberViewLoad; products: MemberProductView[] };
  history: { state: MemberViewLoad; days: MemberOperationDayView[] };
  texts: {
    profile: string;
    /** Подпись пилюли акции. Нужна, когда есть `promo`. */
    promo?: string;
    balanceTitle: string;
    /** Слово при числе в пилюле баланса шапки — в форме по итоговому балансу: «баллов». */
    balanceUnit: string;
    exchange: string;
    updated: string;
    ordersTitle: string;
    ordersAll: string;
    ordersEmpty: string;
    ordersError: string;
    rewardsTitle: string;
    rewardsAll: string;
    /** «нажмите, чтобы забрать» у подарка. Нужна, когда есть подарки. */
    rewardsGiftHint?: string;
    rewardsEmpty: string;
    rewardsError: string;
    /** Подписи блока каталога. Нужны, когда есть `catalog`. */
    catalogTitle?: string;
    catalogAll?: string;
    catalogSale?: string;
    catalogEmpty?: string;
    catalogError?: string;
    historyTitle: string;
    historyAll: string;
    historyEmpty: string;
    historyError: string;
    retry: string;
  };
}>();

defineEmits<{
  profile: [];
  promo: [];
  exchange: [];
  invite: [];
  survey: [];
  orders: [];
  order: [orderId: string];
  rewards: [];
  reward: [rewardId: string];
  gift: [giftId: string];
  catalog: [];
  product: [productId: string];
  history: [];
  retryOrders: [];
  retryRewards: [];
  retryCatalog: [];
  retryHistory: [];
}>();

const amount = useCountUp(() => props.points);

/** Крупное число ушло под шапку — у шапки подложка. Считает `MemberBalance`. */
const barSurface = ref(false);

/** Слайды центра по порядку: бонус первым экраном. */
const WELCOME_SLIDE = 0;
const POINTS_SLIDE = 1;

const slide = ref(WELCOME_SLIDE);

/** Пилюля шапки листает на свой слайд и поднимает экран к нему. */
const showSlide = (target: number): void => {
  slide.value = target;
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
</script>

<template>
  <!-- overflow-x: clip — золотая пыль пилюли акции свисает за правый край экрана на 10–18 px,
       и без обрезки у главной появлялась бы прокрутка вбок (в эталоне она есть). clip, а не hidden:
       контейнером прокрутки обёртка не становится, и липкость шапки работает -->
  <div class="relative flex min-h-dvh flex-col overflow-x-clip bg-xb-screen font-manrope leading-[normal] text-xb-text">
    <OrganismsNextMemberHomeHeader
      :name="name"
      :callsign="callsign"
      :promo="promo"
      :welcome="welcome && { done: welcome.done, total: welcome.total }"
      :welcome-shown="slide === WELCOME_SLIDE"
      :balance="{ amount, unit: texts.balanceUnit }"
      :surface="barSurface"
      :texts="{ profile: texts.profile, promo: texts.promo ?? '', welcome: welcome?.texts.title }"
      @profile="$emit('profile')"
      @promo="$emit('promo')"
      @show-welcome="showSlide(WELCOME_SLIDE)"
      @show-points="showSlide(POINTS_SLIDE)"
    />

    <!-- overflow: clip, а не hidden: живой фон обрезается по блоку, а контейнером прокрутки
         блок не становится -->
    <div class="relative z-[6] flex flex-col gap-[34px] overflow-clip px-5 pt-[104px]" :class="props.invite || props.survey ? 'pb-4' : 'pb-11'">
      <AtomsNextMemberLiveBackdrop variant="home" />

      <OrganismsNextMemberHomeSlider
        v-if="welcome"
        v-model:index="slide"
        :count="2"
        :labels="[welcome.texts.title, texts.balanceTitle]"
      >
        <OrganismsNextMemberWelcomeSlide
          :done="welcome.done"
          :total="welcome.total"
          :amount="welcome.amount"
          :texts="welcome.texts"
        />
        <OrganismsNextMemberBalance
          :amount="amount"
          :texts="{ title: texts.balanceTitle, exchange: texts.exchange, updated: texts.updated }"
          @exchange="$emit('exchange')"
          @covered="(covered) => (barSurface = covered)"
        />
      </OrganismsNextMemberHomeSlider>
      <OrganismsNextMemberBalance
        v-else
        :amount="amount"
        :texts="{ title: texts.balanceTitle, exchange: texts.exchange, updated: texts.updated }"
        @exchange="$emit('exchange')"
        @covered="(covered) => (barSurface = covered)"
      />

      <MoleculesNextMemberInviteBanner
        v-if="props.invite"
        :kicker="props.invite.kicker"
        :title="props.invite.title"
        :when="props.invite.when"
        @open="$emit('invite')"
      />

      <MoleculesNextMemberSurveyBanner
        v-if="props.survey"
        :kicker="props.survey.kicker"
        :title="props.survey.title"
        :when="props.survey.when"
        @open="$emit('survey')"
      />
    </div>

    <OrganismsNextMemberOrdersBlock
      :state="orders.state"
      :orders="orders.items"
      :texts="{ title: texts.ordersTitle, all: texts.ordersAll, empty: texts.ordersEmpty, error: texts.ordersError, retry: texts.retry }"
      @all="$emit('orders')"
      @open="(orderId) => $emit('order', orderId)"
      @retry="$emit('retryOrders')"
    />

    <OrganismsNextMemberRewardsBlock
      :state="rewards.state"
      :rewards="rewards.items"
      :gifts="rewards.gifts"
      :texts="{
        title: texts.rewardsTitle,
        all: texts.rewardsAll,
        giftHint: texts.rewardsGiftHint ?? '',
        empty: texts.rewardsEmpty,
        error: texts.rewardsError,
        retry: texts.retry,
      }"
      @all="$emit('rewards')"
      @open="(rewardId) => $emit('reward', rewardId)"
      @gift="(giftId) => $emit('gift', giftId)"
      @retry="$emit('retryRewards')"
    />

    <OrganismsNextMemberCatalogBlock
      v-if="catalog"
      :state="catalog.state"
      :products="catalog.products"
      :texts="{
        title: texts.catalogTitle ?? '',
        all: texts.catalogAll ?? '',
        sale: texts.catalogSale ?? '',
        empty: texts.catalogEmpty ?? '',
        error: texts.catalogError ?? '',
        retry: texts.retry,
      }"
      @all="$emit('catalog')"
      @open="(productId) => $emit('product', productId)"
      @retry="$emit('retryCatalog')"
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
