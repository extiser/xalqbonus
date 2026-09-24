<script setup lang="ts">
import type { MemberOrderDetailView } from '~/types/memberView';

/**
 * Карточка заказа наверху экрана заказа: состояние, сумма и — у висящего — код.
 *
 * Одним блоком: заказ — это одна вещь, и рассказ о нём не разваливается на отдельно
 * висящую строку состояния и отдельный код. Код отбит линией внутри карточки, а не соседней
 * карточкой: это часть заказа.
 *
 * Висящий — зелёный: «иди забирай». Закрытый спокойный — идти уже некуда; кода у него нет
 * (освобождён после отмены и может принадлежать уже чужому заказу), зато под суммой сказано,
 * что стало с баллами, а под состоянием — причина или офис.
 */
const props = defineProps<{
  order: MemberOrderDetailView;
  /** Подпись над кодом — у висящего. */
  codeTitle: string;
}>();
</script>

<template>
  <AtomsNextMemberCard v-if="props.order.status === 'pending'" tone="green" variant="full">
    <div class="p-4">
      <div class="flex items-baseline gap-3">
        <span class="min-w-0 grow">
          <AtomsNextMemberStateLine tone="green" :state="order.state" :hint="order.hint" />
        </span>
        <span class="shrink-0 text-[17px] font-bold tabular-nums text-xb-secondary">{{ order.amount }}</span>
      </div>
      <div v-if="order.code" class="mt-3.5 border-t border-[rgba(95,208,138,0.22)] pt-3.5">
        <MoleculesNextMemberCodeBlock :title="codeTitle" :code="order.code" size="l" />
      </div>
    </div>
  </AtomsNextMemberCard>

  <AtomsNextMemberCard v-else tone="plain" variant="full">
    <div class="flex items-start gap-3 p-4">
      <span class="flex min-w-0 grow flex-col">
        <AtomsNextMemberStateLine
          :tone="order.status === 'issued' ? 'green' : 'scarlet'"
          :state="order.state"
          :hint="order.hint"
        />
        <span v-if="order.reason" class="mt-[3px] text-[13px] font-light text-xb-grey">{{ order.reason }}</span>
        <span v-if="order.office" class="mt-1.5 text-[13px] font-light text-xb-grey">{{ order.office }}</span>
      </span>
      <span class="flex shrink-0 flex-col items-end gap-0.5">
        <span class="text-[17px] font-bold tabular-nums text-xb-secondary">{{ order.amount }}</span>
        <span v-if="order.amountCaption" class="text-[12px] font-light text-xb-grey">{{ order.amountCaption }}</span>
      </span>
    </div>
  </AtomsNextMemberCard>
</template>
