<script setup lang="ts">
import type { MemberItemTone, MemberOrderRowView, MemberOrderStatus, MemberViewLoad } from '~/types/memberView';

/**
 * Раздел «Мои заказы» — `_reference/design/orders/orders-screen.html`; ждущих нет —
 * `orders-screen-nopending.html`; заказов не было и не загрузилось — `orders-screen-empty.html`.
 *
 * Две группы, как у наград: сверху ждущие выдачи со счётчиком, ниже история заказов.
 * Ждущих нет — группа остаётся с нулём и строкой «Здесь пусто»: исчезнувшая группа читалась бы
 * как «раздел был, а теперь пропал» (Руслан, 24-09-2026). Карточка открывает экран заказа —
 * там код, офис и состав.
 */
defineProps<{
  state: MemberViewLoad;
  pending: MemberOrderRowView[];
  past: MemberOrderRowView[];
  /** Баланс справа в шапке — готовыми строками («Ваши баллы», «1 450»). */
  balance?: { label: string; amount: string };
  texts: {
    title: string;
    back: string;
    pendingGroup: string;
    pastGroup: string;
    /** «Здесь пусто» под группой без ждущих. */
    groupEmpty: string;
    empty: string;
    error: string;
    retry: string;
  };
}>();

defineEmits<{ back: []; open: [orderId: string]; retry: [] }>();

const TONES: Record<MemberOrderStatus, MemberItemTone> = {
  pending: 'waiting',
  issued: 'issued',
  cancelled: 'cancelled',
};

/** Заказ — свойствами карточки: тон по состоянию, остальное как есть. */
function itemCard(order: MemberOrderRowView) {
  return {
    title: order.title,
    state: order.state,
    hint: order.hint,
    tone: TONES[order.status],
    reason: order.reason,
    amount: order.amount,
    amountCaption: order.amountCaption,
    office: order.office,
    action: order.actionLabel,
  };
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(40px+env(safe-area-inset-bottom))] font-manrope leading-[normal] text-xb-text">
    <MoleculesNextMemberSectionBar :title="texts.title" :back-label="texts.back" :balance="balance" @back="$emit('back')" />

    <div v-if="state === 'ready'" class="flex flex-col gap-2.5 px-4 pb-5 pt-2">
      <div class="px-0.5 pb-0.5 pt-[18px]">
        <AtomsNextMemberGroupLabel :label="texts.pendingGroup" :count="pending.length" />
      </div>
      <MoleculesNextMemberItemCard v-for="order in pending" :key="order.id" v-bind="itemCard(order)" @open="$emit('open', order.id)" />
      <div v-if="pending.length === 0" class="px-1 pb-2 pt-6">
        <AtomsNextMemberEmptyLine :label="texts.groupEmpty" />
      </div>

      <template v-if="past.length > 0">
        <div class="px-0.5 pb-0.5 pt-[18px]">
          <AtomsNextMemberGroupLabel :label="texts.pastGroup" />
        </div>
        <MoleculesNextMemberItemCard v-for="order in past" :key="order.id" v-bind="itemCard(order)" @open="$emit('open', order.id)" />
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
