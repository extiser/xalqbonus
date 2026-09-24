<script setup lang="ts">
/**
 * Низ витрины: итог и «Оформить» — `_reference/design/catalog/catalog-showcase.html` (`.checkout`),
 * состояния — `catalog-showcase-states.html`.
 *
 * Липкий, в зоне большого пальца: водитель листает витрину и всё время видит, сколько набрал
 * и сколько останется. Итог одной строкой, короткие подписи с точкой — «Сумма · 2 310»
 * слева, «Останется · 140» справа, со знаком балла у чисел (Руслан, 23-09-2026): так строка
 * держится и на 320. Остаток в минусе — алым.
 *
 * «Оформить» погашенной без объяснения неотличима от сломанной, поэтому под ней причина:
 * серым, если просто нечего оформлять, алым мягким — если не хватает баллов.
 */
type ReasonTone = 'quiet' | 'warn';

withDefaults(
  defineProps<{
    /** Сумма числом: «2 310». */
    total: string;
    /** Что останется на балансе: «140», «−590». */
    remaining: string;
    /** Остаток ушёл в минус — число алым. */
    remainingNegative?: boolean;
    disabled?: boolean;
    /** Причина под кнопкой. */
    reason?: string;
    reasonTone?: ReasonTone;
    texts: {
      total: string;
      remaining: string;
      checkout: string;
    };
  }>(),
  { remainingNegative: false, disabled: false, reason: undefined, reasonTone: 'quiet' },
);

defineEmits<{ checkout: [] }>();
</script>

<template>
  <div
    class="sticky bottom-0 z-[5] border-t border-white/6 bg-[rgba(11,13,17,0.9)] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3.5 font-manrope leading-[normal] backdrop-blur-[14px]"
  >
    <div class="member-checkout-sum flex items-baseline justify-between gap-3 px-0.5 pb-3 text-[14px] font-normal text-xb-grey">
      <span class="whitespace-nowrap">
        {{ texts.total }} ·
        <b class="inline-flex items-center gap-[3px] text-[15px] font-bold tabular-nums text-xb-text">
          <span class="relative top-px flex text-xb-garnet"><AtomsNextMemberPointsIcon :size="13" /></span>{{ total }}
        </b>
      </span>
      <span class="whitespace-nowrap">
        {{ texts.remaining }} ·
        <b
          class="inline-flex items-center gap-[3px] text-[15px] font-bold tabular-nums"
          :class="remainingNegative ? 'text-xb-scarlet' : 'text-xb-text'"
        >
          <span class="relative top-px flex text-xb-garnet"><AtomsNextMemberPointsIcon :size="13" /></span>{{ remaining }}
        </b>
      </span>
    </div>

    <AtomsNextMemberButton size="l" tone="garnet" :disabled="disabled" @click="$emit('checkout')">{{ texts.checkout }}</AtomsNextMemberButton>

    <p
      v-if="reason"
      class="m-0 mt-2.5 text-center text-[13px] font-normal leading-[1.4]"
      :class="reasonTone === 'warn' ? 'text-xb-scarlet-soft' : 'text-xb-grey'"
    >
      {{ reason }}
    </p>
  </div>
</template>

<style scoped>
/* Узкие телефоны: итог мельче, чтобы обе половины остались в одну строку. */
@media (max-width: 360px) {
  .member-checkout-sum {
    font-size: 13px;
  }
}
</style>
