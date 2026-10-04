<script setup lang="ts">
import { computed } from 'vue';
import { valueSign } from '~/utils/signedValue';

/**
 * Изменение со знаком и базой — роль «Изменение» кодекса веба: Manrope 15 / 600, «**+8,3 млн**
 * к сентябрю». Вид — `.delta` в `_reference/design/web/dashboard/01-money.html`.
 *
 * Число жирное, зелёное или алое по `tone`, база — цветом названия плитки. Тон задаётся
 * отдельно от знака: минус бывает и хорошим — расходы упали. Но без знака цвета нет вовсе:
 * число без знака алым читается как минус (`codex.md`, «Алый и зелёный — только у числа
 * со знаком»), и такое изменение рисуется белым, как обычное число.
 *
 * Стрелка тренда смотрит по знаку и красится по тону. Без знака её нет: показать ей нечего.
 */
type DeltaTone = 'up' | 'down';

const props = defineProps<{
  /** Строка со знаком: «+8,3 млн», «−0,4 млн». */
  value: string;
  /** С чем сравнили, словом: «к сентябрю», «к октябрю 2025». */
  base: string;
  tone: DeltaTone;
  /** Стрелка тренда после базы — у главного изменения экрана. */
  trend?: boolean;
}>();

const TONE_CLASSES: Record<DeltaTone, string> = {
  up: 'text-web-green',
  down: 'text-web-scarlet',
};

const sign = computed(() => valueSign(props.value));
</script>

<template>
  <span class="inline-flex items-baseline gap-1.5 font-manrope text-[15px] font-semibold text-web-title">
    <b class="font-bold" :class="sign ? TONE_CLASSES[tone] : 'text-web-text'">{{ value }}</b>
    <span>{{ base }}</span>
    <svg
      v-if="trend && sign"
      viewBox="0 0 18 12"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-3 w-[18px] self-center"
      :class="[TONE_CLASSES[tone], sign === 'minus' ? '-scale-y-100' : '']"
      aria-hidden="true"
    >
      <path d="M1 11l5-5 4 3 7-7M12 2h5v5" />
    </svg>
  </span>
</template>
