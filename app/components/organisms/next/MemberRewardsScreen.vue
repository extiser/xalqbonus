<script setup lang="ts">
import { computed } from 'vue';
import type { MemberGiftView, MemberItemTone, MemberRewardStatus, MemberRewardView, MemberViewLoad } from '~/types/memberView';

/**
 * Раздел «Мои награды» — `_reference/design/orders/rewards-screen.html`; ждущих нет —
 * `rewards-screen-nopending.html`; наград не было и не загрузилось — `rewards-screen-empty.html`.
 *
 * Собран видом «Моих заказов» (Руслан, 24-09-2026): та же карточка, что у заказа, с происхождением
 * под названием. Две группы: сверху ждущие в офисе со счётчиком — за ними идти, ниже история наград.
 * Ждущих нет — группа остаётся с нулём и строкой «Здесь пусто», как у заказов.
 *
 * Кода в списке нет — он на экране награды. Товар и произвольная награда открывают его,
 * баллы на балансе не открываются: экран им не нужен.
 *
 * Подарки от Xalq Taxi — группой над ждущими (`_reference/design/gifts/rewards-screen-gift.html`),
 * у каждого «Забрать» с тем же поведением, что в шторке: ожидание, лопание с серпантином,
 * ошибка под карточкой. «Забрать всё» здесь нет — только в шторке (Руслан, 24-09-2026).
 * Счётчик уменьшается с каждым забранным, когда место подарка схлопнулось и страница убрала его
 * из списка. Лопается последний — подпись группы схлопывается вместе с его местом, и группы
 * нет вовсе: без «· 0» и «Здесь пусто» — подарок событие, а не очередь (Руслан, 24-09-2026).
 * Состояний подарков экран не хранит: они приходят свойствами, как в шторке.
 */
const props = withDefaults(
  defineProps<{
    state: MemberViewLoad;
    awaiting: MemberRewardView[];
    past: MemberRewardView[];
    gifts?: MemberGiftView[];
    /** Подарки, которые ждут ответа на «Забрать». */
    giftsBusy?: readonly string[];
    /** Забранные — лопаются. */
    giftsPopping?: readonly string[];
    /** Незабранные — строка ошибки под карточкой. */
    giftErrors?: Readonly<Record<string, string>>;
    /** Баланс справа в шапке — готовыми строками («Ваши баллы», «1 450»). */
    balance?: { label: string; amount: string };
    texts: {
      title: string;
      back: string;
      /** «Подарки от Xalq Taxi». */
      giftsGroup: string;
      take: string;
      awaitingGroup: string;
      pastGroup: string;
      /** «Здесь пусто» под группой без ждущих. */
      groupEmpty: string;
      empty: string;
      error: string;
      retry: string;
    };
  }>(),
  { gifts: () => [], giftsBusy: () => [], giftsPopping: () => [], giftErrors: () => ({}), balance: undefined },
);

defineEmits<{ back: []; open: [rewardId: string]; take: [giftId: string]; popped: [giftId: string]; retry: [] }>();

/** Лопаются все, что остались, — подпись группы уходит вместе с последним. */
const giftsLeaving = computed(
  () => props.gifts.length > 0 && props.gifts.every((gift) => props.giftsPopping.includes(gift.id)),
);

const TONES: Record<MemberRewardStatus, MemberItemTone> = {
  awaiting: 'waiting',
  credited: 'credited',
  issued: 'issued',
  expired: 'cancelled',
};

/** Награда — свойствами карточки: тон по состоянию, остальное как есть. */
function itemCard(reward: MemberRewardView) {
  return {
    title: reward.title,
    origin: reward.origin,
    state: reward.state,
    hint: reward.hint,
    tone: TONES[reward.status],
    reason: reward.reason,
    office: reward.office,
    action: reward.actionLabel,
  };
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(40px+env(safe-area-inset-bottom))] font-manrope leading-[normal] text-xb-text">
    <MoleculesNextMemberSectionBar :title="texts.title" :back-label="texts.back" :balance="balance" @back="$emit('back')" />

    <div v-if="state === 'ready'" class="flex flex-col gap-2.5 px-4 pb-5 pt-2">
      <template v-if="gifts.length > 0">
        <div class="rewards-gifts-label" :class="giftsLeaving ? 'rewards-gifts-label-gone' : ''">
          <div class="min-h-0 overflow-hidden">
            <div class="px-0.5 pb-0.5 pt-[18px]">
              <AtomsNextMemberGroupLabel :label="texts.giftsGroup" :count="gifts.length" />
            </div>
          </div>
        </div>
        <MoleculesNextMemberGiftCard
          v-for="gift in gifts"
          :key="gift.id"
          :gift="gift"
          mode="take"
          :take-label="texts.take"
          :busy="giftsBusy.includes(gift.id)"
          :error="giftErrors[gift.id]"
          :popping="giftsPopping.includes(gift.id)"
          @take="$emit('take', gift.id)"
          @popped="$emit('popped', gift.id)"
        />
      </template>

      <div class="px-0.5 pb-0.5 pt-[18px]">
        <AtomsNextMemberGroupLabel :label="texts.awaitingGroup" :count="awaiting.length" />
      </div>
      <MoleculesNextMemberItemCard v-for="reward in awaiting" :key="reward.id" v-bind="itemCard(reward)" @open="$emit('open', reward.id)" />
      <div v-if="awaiting.length === 0" class="px-1 pb-2 pt-6">
        <AtomsNextMemberEmptyLine :label="texts.groupEmpty" />
      </div>

      <template v-if="past.length > 0">
        <div class="px-0.5 pb-0.5 pt-[18px]">
          <AtomsNextMemberGroupLabel :label="texts.pastGroup" />
        </div>
        <MoleculesNextMemberItemCard v-for="reward in past" :key="reward.id" v-bind="itemCard(reward)" @open="$emit('open', reward.id)" />
      </template>
    </div>

    <MoleculesNextMemberNotice v-else-if="state === 'empty'" state="empty" size="screen" :message="texts.empty" />

    <MoleculesNextMemberNotice
      v-else-if="state === 'error'"
      state="error"
      size="screen"
      :message="texts.error"
      :retry-label="texts.retry"
      @retry="$emit('retry')"
    />
  </div>
</template>

<style scoped>
/*
 * Подпись группы подарков схлопывается тем же темпом, что место последнего подарка: через 0.75 с
 * за 0.3 с. Она стоит в списке первой, поэтому зазор 10 под ней съедается снизу — иначе после
 * ухода группы «Ждут в офисе» прыгала бы на 10 вверх.
 */
.rewards-gifts-label {
  display: grid;
  grid-template-rows: 1fr;
  transition:
    grid-template-rows 0.3s ease-in 0.75s,
    margin 0.3s ease-in 0.75s;
}

.rewards-gifts-label-gone {
  grid-template-rows: 0fr;
  margin-bottom: -10px;
}
</style>
