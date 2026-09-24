<script setup lang="ts">
import type { MemberItemTone } from '~/types/memberView';

/**
 * Карточка наверху экрана заказа и экрана награды: откуда, состояние, сумма и — у ждущего — код.
 * Заказ — `_reference/design/orders/order-screen.html`, `order-screen-states.html`; награда —
 * `reward-screen.html`, `reward-screen-states.html`.
 *
 * Одним блоком: заказ или награда — это одна вещь, и рассказ о ней не разваливается на отдельно
 * висящую строку состояния и отдельный код. Код отбит линией внутри карточки, а не соседней
 * карточкой: это часть заказа.
 *
 * Ждущий — зелёный: «иди забирай». Закрытый спокойный — идти уже некуда; кода у него нет
 * (освобождён после закрытия и может принадлежать уже чужому заказу), зато под суммой сказано,
 * что стало с баллами, а под состоянием — причина или офис.
 *
 * У награды суммы нет, зато первой строкой — откуда она, белым: происхождение про награду
 * целиком, а не про строку товара (Руслан, 24-09-2026).
 */
const props = defineProps<{
  /** `credited` здесь не бывает: баллам на балансе экран не нужен. */
  tone: Exclude<MemberItemTone, 'credited'>;
  /** Слово состояния: «Ждёт выдачи», «Получена». */
  state: string;
  hint?: string;
  /** Откуда награда — первой строкой. */
  origin?: string;
  /** Причина под состоянием: «Вы отменили заказ». */
  reason?: string;
  /** Офис строкой — у выданного заказа. */
  office?: string;
  /** Сумма заказа: «900 баллов». У награды нет. */
  amount?: string;
  /** Подпись под суммой — у закрытого заказа. */
  amountCaption?: string;
  /** Код выдачи — только у ждущего. */
  code?: string;
  /** Подпись над кодом. */
  codeTitle?: string;
}>();
</script>

<template>
  <AtomsNextMemberCard v-if="props.tone === 'waiting'" tone="green" variant="full">
    <div class="p-4 leading-[normal]">
      <div v-if="origin" class="mb-1.5 text-[14px] font-medium text-xb-text">{{ origin }}</div>
      <div class="flex items-baseline gap-3">
        <span class="min-w-0 grow">
          <AtomsNextMemberStateLine tone="green" :state="state" :hint="hint" />
        </span>
        <span v-if="amount" class="shrink-0 text-[17px] font-bold tabular-nums text-xb-secondary">{{ amount }}</span>
      </div>
      <div v-if="code && codeTitle" class="mt-3.5 border-t border-[rgba(95,208,138,0.22)] pt-3.5">
        <MoleculesNextMemberCodeBlock :title="codeTitle" :code="code" size="l" />
      </div>
    </div>
  </AtomsNextMemberCard>

  <AtomsNextMemberCard v-else tone="plain" variant="full">
    <div class="p-4 leading-[normal]">
      <div v-if="origin" class="mb-1.5 text-[14px] font-medium text-xb-text">{{ origin }}</div>
      <div class="flex items-start gap-3">
        <span class="flex min-w-0 grow flex-col">
          <AtomsNextMemberStateLine :tone="tone === 'issued' ? 'green' : 'scarlet'" :state="state" :hint="hint" />
          <span v-if="reason" class="mt-[3px] text-[13px] font-light text-xb-grey">{{ reason }}</span>
          <span v-if="office" class="mt-1.5 text-[13px] font-light text-xb-grey">{{ office }}</span>
        </span>
        <span v-if="amount" class="flex shrink-0 flex-col items-end gap-0.5">
          <span class="text-[17px] font-bold tabular-nums text-xb-secondary">{{ amount }}</span>
          <span v-if="amountCaption" class="text-[12px] font-light text-xb-grey">{{ amountCaption }}</span>
        </span>
      </div>
    </div>
  </AtomsNextMemberCard>
</template>
