<script setup lang="ts">
import { computed } from 'vue';
import { DASH, endSentence, formatCompactSum, formatNumber, formatTenths, formatWholePercent } from '~/utils/format';
import { hiredCount, hiredWhen, noHiredText, ongoingHireNote } from '~/utils/hirePayback';
import { monthForms, monthYear } from '#shared/monthNames';
import type { LoadState } from '~/types/loadState';
import type { DashboardHirePayback } from '#shared/types/dashboard';

/**
 * Плитка «Окупается ли найм» вкладки «Глубина» (issue #445), 4 × 3 — экраны
 * `_reference/design/web/dashboard/03-depth.html` (расходы не заданы)
 * и `03-depth-hire-set.html` (заданы).
 *
 * Месяц плитки — месяц экрана, и идущий тоже: у идущего нанятые — с 1-го по вчера, расходы —
 * бюджет, это говорит строка под названием. Расходы за месяц не заданы — крупно доход с нанятого
 * за первый год и при какой цене найм окупается, внизу «Задать». Заданы — крупно окупаемость, под
 * ней из чего она, внизу откуда стоимость и «Изменить». Кнопки открывают окно «Расходы на найм» —
 * его держит страница, плитка только говорит `edit`. Числа считает сервер, здесь только подписи.
 *
 * Собраны не все сутки наборов — вместо дохода прочерк и строка покрытия; нанятые и расходы
 * от прогона денег не зависят и остаются.
 *
 * Данные — свойством: сама плитка в сеть не ходит (docs/frontend.md).
 */
const props = defineProps<{
  state: LoadState;
  hirePayback: DashboardHirePayback | null;
}>();

const emit = defineEmits<{ edit: [] }>();

const ready = computed(() => (props.state === 'ready' ? props.hirePayback : null));

const note = computed(() => (ready.value ? ongoingHireNote(ready.value) : null));

const value = computed(() =>
  ready.value?.valuePerHired == null ? DASH : formatCompactSum(ready.value.valuePerHired),
);

/** «из нанятых не поехали ни разу 23 % — 242 из 1 074». */
const notRodeText = computed(() => {
  const payback = ready.value;

  if (!payback || payback.notRode === null || payback.hired === null || payback.notRodePercent === null) return null;

  return `из нанятых не поехали ни разу ${formatWholePercent(payback.notRodePercent)} — ${formatNumber(payback.notRode)} из ${formatNumber(payback.hired)}`;
});

/**
 * Строка внизу: откуда стоимость одного — или просьба её задать. У закрытого месяца расходы —
 * потраченные по факту, у идущего — бюджет.
 */
const costText = computed(() => {
  const payback = ready.value;

  if (!payback) return null;

  const { nominative, prepositional } = monthForms(payback.month);

  if (!payback.cost) {
    return payback.ongoing
      ? `Впишите бюджет на найм на ${nominative} — разделим на нанятых с начала месяца`
      : `Впишите, сколько парк потратил на найм за ${nominative}, — разделим на нанятых в ${prepositional}`;
  }

  const division = `${formatCompactSum(payback.cost.amount)} ÷ ${hiredCount(payback.monthHired)} ${hiredWhen(payback)}`;

  return payback.ongoing
    ? `Бюджет на найм на ${nominative} — ${division}`
    : `Потрачено на найм за ${nominative} — ${division}`;
});

/** «Собраны не все сутки: июль 2025 — 28 из 31. Доход с нанятого не считаем». */
const coverageText = computed(() => {
  const incomplete = ready.value?.coverage.filter((period) => period.coveredDays < period.days) ?? [];

  if (incomplete.length === 0) return null;

  const parts = incomplete.map(
    (period) => `${monthYear(period.from.slice(0, 7), 'nominative')} — ${period.coveredDays} из ${period.days}`,
  );

  return `Собраны не все сутки: ${parts.join(', ')}. Доход с нанятого не считаем`;
});
</script>

<template>
  <MoleculesWebTile :cols="4" :rows="3" title="Окупается ли найм" :metric="ready ? 'hirePayback' : undefined">
    <div v-if="state === 'loading'" class="mt-[18px]">
      <AtomsWebHint text="Считаем окупаемость найма…" />
    </div>
    <div v-else-if="state === 'error' || !ready" class="mt-[18px]">
      <AtomsWebHint text="Окупаемость найма не загрузилась. Это отказ запроса, а не пустой месяц." />
    </div>
    <template v-else>
      <div v-if="note" class="mt-0.5">
        <AtomsWebHint :text="note" />
      </div>

      <template v-if="!ready.cost">
        <AtomsWebFigure class="mt-3" size="tile" :value="value" :tone="ready.valuePerHired === null ? 'muted' : 'default'" />
        <div class="mt-2 font-manrope text-[15px] leading-[1.35] font-medium text-web-title">
          нанятый приносит парку за первый год
        </div>
        <div v-if="notRodeText" class="mt-1.5">
          <AtomsWebHint :text="notRodeText" />
        </div>
        <p v-if="ready.valuePerHired !== null" class="m-0 mt-3 font-manrope text-[14px] leading-[1.45] text-web-title">
          Стоимость найма не задана. Найм окупается за год, если водитель обходится дешевле {{ endSentence(value) }}
        </p>
      </template>

      <template v-else-if="ready.cost.perHired === null">
        <p class="m-0 mt-3 font-manrope text-[15px] leading-[1.35] font-medium text-web-title">
          {{ noHiredText(ready) }}
        </p>
        <div class="mt-3">
          <AtomsWebHint :text="`нанятый приносит ${value}`" />
        </div>
        <div v-if="notRodeText" class="mt-1.5">
          <AtomsWebHint :text="notRodeText" />
        </div>
      </template>

      <template v-else>
        <AtomsWebFigure
          class="mt-3"
          size="tile"
          :value="ready.payback === null ? DASH : formatTenths(ready.payback)"
          :unit="ready.payback === null ? undefined : 'раза'"
          :tone="ready.payback === null ? 'muted' : 'default'"
        />
        <div class="mt-2 font-manrope text-[15px] leading-[1.35] font-medium text-web-title">
          {{
            ready.payback !== null && ready.payback < 1
              ? `Найм за год не окупается: каждый сум возвращает ${formatTenths(ready.payback)}`
              : 'возвращается за год каждый сум, потраченный на найм'
          }}
        </div>
        <div class="mt-3">
          <AtomsWebHint :text="`нанятый приносит ${value}, найм одного стоит ${formatCompactSum(ready.cost.perHired)}`" />
        </div>
        <div v-if="notRodeText" class="mt-1.5">
          <AtomsWebHint :text="notRodeText" />
        </div>
      </template>

      <div v-if="coverageText" class="mt-3">
        <AtomsWebHint :text="coverageText" />
      </div>

      <div class="mt-auto flex items-end justify-between gap-3 pt-2.5">
        <AtomsWebHint :text="costText ?? ''" />
        <AtomsWebActionButton :label="ready.cost ? 'Изменить' : 'Задать'" @click="emit('edit')" />
      </div>
    </template>
  </MoleculesWebTile>
</template>
