<script setup lang="ts">
import { computed } from 'vue';
import { valueSign } from '~/utils/signedValue';
import type { MetricKey } from '#shared/metrics';

/**
 * Строка разбора «Почему изменилось» — `.why-row` в `_reference/design/web/dashboard/01-money.html`:
 * подпись слева, под ней уточнение, справа слагаемое со знаком. Роль «Строка» кодекса —
 * Manrope 15 / 500.
 *
 * Итоговая строка (`total`) отбита линией сверху и пишется белым: это сумма слагаемых над ней.
 * Слагаемое красится по тону, только если у него есть знак — то же правило кодекса, что
 * у изменения (`AtomsWebDelta`).
 *
 * С ключом метрики (`metric`) после подписи стоит значок подсказки (`codex.md`, «Подсказка
 * метрики»: значок — у подписи строки разбора). Строка без знака у числа — «Экономика
 * программы» (issue #373) — тона не имеет: число без знака пишется белым.
 *
 * Расстояние между строками ставит список, строка своего отступа снаружи не имеет.
 */
type BreakdownTone = 'up' | 'down';
type BreakdownVariant = 'row' | 'total';

const props = withDefaults(
  defineProps<{
    label: string;
    /** Вторая строка под подписью: «83 120 против 79 400». */
    hint?: string;
    /** Слагаемое со знаком: «+6,2 млн», «−0,4 млн». */
    value: string;
    /** Тон слагаемого со знаком. Без знака у числа не нужен. */
    tone?: BreakdownTone;
    /** Золотая точка программы перед подписью — «Программа дороже». */
    marker?: 'program';
    metric?: MetricKey;
    variant?: BreakdownVariant;
  }>(),
  { variant: 'row' },
);

const TONE_CLASSES: Record<BreakdownTone, string> = {
  up: 'text-web-green',
  down: 'text-web-scarlet',
};

const VARIANT_CLASSES: Record<BreakdownVariant, string> = {
  row: 'text-web-title',
  total: 'border-t border-web-line pt-3 text-web-text',
};

const sign = computed(() => valueSign(props.value));
</script>

<template>
  <div class="grid grid-cols-[1fr_auto] gap-3 font-manrope text-[15px] font-medium" :class="VARIANT_CLASSES[variant]">
    <span class="min-w-0">
      <AtomsWebProgramDot v-if="marker === 'program'" /><MoleculesWebMetricLabel :label="label" :metric="metric" />
      <span v-if="hint" class="mt-0.5 block text-[12px] font-light text-web-grey">{{ hint }}</span>
    </span>
    <b class="text-right font-bold" :class="sign && tone ? TONE_CLASSES[tone] : 'text-web-text'">{{ value }}</b>
  </div>
</template>
