<script setup lang="ts">
import type { MemberItemTone, MemberOrderDetailView, MemberOrderStatus } from '~/types/memberView';

/**
 * Экран заказа — `_reference/design/orders/order-screen.html` и закрытые состояния
 * `order-screen-states.html`.
 *
 * Живой заказ: карточка с кодом, карточка офиса, состав с «Суммой» и отмена внизу — вторичной
 * кнопкой, потому что отмена не то, зачем сюда пришли. Закрытый: карточка без кода, без офиса
 * и без отмены — забирать и отменять нечего; состав остаётся, «что я заказывал» — единственный
 * вопрос, с которым сюда возвращаются.
 */
defineProps<{
  order: MemberOrderDetailView;
  /** Баланс справа в шапке — готовыми строками («Ваши баллы», «1 450»). */
  balance?: { label: string; amount: string };
  texts: {
    back: string;
    codeTitle: string;
    officeTitle: string;
    map: string;
    linesTitle: string;
    total: string;
    cancel: string;
  };
}>();

defineEmits<{ back: []; map: []; cancel: [] }>();

const TONES: Record<MemberOrderStatus, Exclude<MemberItemTone, 'credited'>> = {
  pending: 'waiting',
  issued: 'issued',
  cancelled: 'cancelled',
};
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(40px+env(safe-area-inset-bottom))] font-manrope leading-[normal] text-xb-text">
    <MoleculesNextMemberSectionBar :title="order.title" :back-label="texts.back" :balance="balance" @back="$emit('back')" />

    <div class="flex flex-col gap-3 px-4 pt-3.5">
      <MoleculesNextMemberOrderStatusCard
        :tone="TONES[order.status]"
        :state="order.state"
        :hint="order.hint"
        :reason="order.reason"
        :office="order.office"
        :amount="order.amount"
        :amount-caption="order.amountCaption"
        :code="order.code"
        :code-title="texts.codeTitle"
      />

      <MoleculesNextMemberOfficeCard
        v-if="order.officeCard"
        :office="order.officeCard"
        :texts="{ title: texts.officeTitle, map: texts.map }"
        @map="$emit('map')"
      />

      <div class="px-0.5 pt-3.5">
        <MoleculesNextMemberOrderLines
          :lines="order.lines"
          :total="order.total"
          :texts="{ title: texts.linesTitle, total: texts.total }"
        />
      </div>
    </div>

    <div v-if="order.cancellable" class="px-4 pt-5">
      <AtomsNextMemberButton size="l" tone="danger" @click="$emit('cancel')">{{ texts.cancel }}</AtomsNextMemberButton>
    </div>
  </div>
</template>
