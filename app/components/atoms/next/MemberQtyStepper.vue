<script setup lang="ts">
import { computed } from 'vue';

/**
 * Счётчик количества «− N +» — `_reference/design/catalog/catalog-showcase.html` (`.step`)
 * и `catalog-confirm.html` (`.qtx`).
 *
 * Два размера. `tile` — на плитке витрины, во всю ширину плитки, высотой 40, как вторичная
 * кнопка S: у невыбранного товара тёмный, с серым нулём и погашенным «−», у выбранного — белый.
 * Так выбранное видно без зелёного (Руслан, 23-09-2026). Число — вес 500: жирное спорило
 * с ценой над ним.
 *
 * `line` — тихий, без рамки, в строке состава подтверждения: кнопки-кружки 28, между ними
 * «1 шт.». «−» там не гаснет: до нуля строка уходит из заказа.
 *
 * «+» гаснет на остатке офиса (`max`). Число и подписи кнопок приходят готовыми.
 */
type StepperSize = 'tile' | 'line';

const props = defineProps<{
  size: StepperSize;
  count: number;
  /** Что стоит между кнопками: «1», «1 шт.». Нет — число. */
  label?: string;
  /** Остаток — больше не взять. */
  max?: number;
  /** Подписи кнопок для экранного чтеца: на экране у них только знаки. */
  texts: {
    decrease: string;
    increase: string;
  };
}>();

defineEmits<{ inc: []; dec: [] }>();

const selected = computed(() => props.count > 0);
const increaseDisabled = computed(() => props.max !== undefined && props.count >= props.max);
</script>

<template>
  <div
    v-if="size === 'tile'"
    class="box-border flex h-10 items-center justify-between rounded-full border font-manrope leading-[normal]"
    :class="selected ? 'border-xb-text bg-xb-text text-xb-screen' : 'border-white/14 bg-white/5 text-xb-text'"
  >
    <button
      type="button"
      :aria-label="texts.decrease"
      :disabled="count <= 0"
      class="flex h-[38px] w-11 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-inherit disabled:cursor-default disabled:opacity-30"
      @click="$emit('dec')"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <path d="M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    </button>
    <b class="text-[16px] font-medium tabular-nums" :class="selected ? '' : 'text-xb-grey'">{{ label ?? count }}</b>
    <button
      type="button"
      :aria-label="texts.increase"
      :disabled="increaseDisabled"
      class="flex h-[38px] w-11 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-inherit disabled:cursor-default disabled:opacity-30"
      @click="$emit('inc')"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    </button>
  </div>

  <div v-else class="flex items-center gap-0.5 font-manrope leading-[normal]">
    <button
      type="button"
      :aria-label="texts.decrease"
      :disabled="count <= 0"
      class="flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-white/6 p-0 text-xb-text disabled:cursor-default disabled:opacity-30"
      @click="$emit('dec')"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path d="M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    </button>
    <b class="min-w-11 text-center text-[13px] font-medium text-xb-secondary">{{ label ?? count }}</b>
    <button
      type="button"
      :aria-label="texts.increase"
      :disabled="increaseDisabled"
      class="flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-white/6 p-0 text-xb-text disabled:cursor-default disabled:opacity-30"
      @click="$emit('inc')"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>
