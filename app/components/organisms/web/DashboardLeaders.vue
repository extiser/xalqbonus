<script setup lang="ts">
import { computed } from 'vue';
import { DASH, formatNumber, pluralize } from '~/utils/format';
import {
  asOfText,
  belowNormLabel,
  collectedText,
  incompleteMonthsText,
  leadersMetricValues,
  leadersOf,
  noLeadersText,
  streakPlusLabel,
} from '~/utils/leaders';
import { monthForms, shiftMonth } from '#shared/monthNames';
import type { LoadState } from '~/types/loadState';
import type { DashboardLevers } from '#shared/types/dashboard';

/**
 * Три плитки лидеров на «Рычагах» под потоком водителей (issue #402) — `02-levers.html`, по 4 × 2:
 * «Лидеры по поездкам» → «Лидеры ездят меньше обычного» → «Из лидеров ушли», в порядке групп списка
 * под ними (`OrganismsWebDashboardLeadersList`). Под названием каждой — чьи это лидеры.
 *
 * Состояния — по макетам: первый месяц истории — «—» и строка, когда лидеры появятся
 * (`02-levers-first-month.html`); собраны не все сутки — «—» и причина с покрытием
 * (`02-levers-leaders-incomplete.html`); никого — нули и строка (`02-levers-leaders-empty.html`).
 * Загрузка и отказ ручки — как у плиток потока.
 *
 * Пороги в подписях и подсказках — из ответа ручки: это константы сервера.
 */
const props = defineProps<{
  state: LoadState;
  levers: DashboardLevers | null;
}>();

const ready = computed(() => (props.state === 'ready' ? props.levers : null));

const leaders = computed(() => ready.value?.leaders ?? null);

const metricValues = computed(() => (leaders.value ? leadersMetricValues(leaders.value.thresholds) : undefined));

const firstMonthNote = computed(() =>
  leaders.value?.noLeaders && ready.value ? noLeadersText(leaders.value, ready.value.range.firstMonth) : null,
);

const leadersTitle = computed(() =>
  leaders.value ? `Лидеры по поездкам · верхние ${leaders.value.thresholds.leadersPercent} %` : 'Лидеры по поездкам',
);

/** Доля поездок лидеров процентом до целого; остальным — остаток до ста, чтобы подписи сходились. */
const share = computed(() => {
  const part = leaders.value?.leaders;

  if (!part?.counted || part.allTrips === 0) return null;

  const theirs = Math.round((part.leaderTrips / part.allTrips) * 100);

  return { theirs, others: 100 - theirs };
});

const thresholdLine = computed(() =>
  leaders.value
    ? { below: belowNormLabel(leaders.value.thresholds), streak: streakPlusLabel(leaders.value.thresholds) }
    : null,
);

const cohortNote = computed(() => {
  const value = leaders.value;

  if (!value) return null;

  const next = shiftMonth(value.cohortMonth, 1);

  return `${leadersOf(value.cohortMonth)}, в ${monthForms(next).prepositional} без поездок`;
});

const cohortUnavailableText = computed(() => {
  const value = leaders.value;

  return value && ready.value
    ? `Лидеров за ${monthForms(value.cohortMonth).nominative} ${value.cohortMonth.slice(0, 4)} нет: история заказов — с ${monthForms(ready.value.range.firstMonth).genitive} ${ready.value.range.firstMonth.slice(0, 4)}.`
    : null;
});

const LOADING_TEXT = 'Считаем лидеров…';
const ERROR_TEXT = 'Лидеры не загрузились. Это отказ запроса, а не пустой месяц.';
</script>

<template>
  <!-- Лидеры по поездкам -->
  <MoleculesWebTile :cols="4" :rows="2" :title="leadersTitle" :metric="leaders ? 'leaders' : undefined" :metric-values="metricValues">
    <div v-if="state === 'loading'" class="mt-3"><AtomsWebHint :text="LOADING_TEXT" /></div>
    <div v-else-if="state === 'error' || !leaders" class="mt-3"><AtomsWebHint :text="ERROR_TEXT" /></div>
    <template v-else-if="leaders.noLeaders || !leaders.leaders">
      <AtomsWebFigure class="mt-3" size="tile" tone="muted" :value="DASH" />
      <div class="mt-auto pt-2.5"><AtomsWebHint :text="firstMonthNote ?? ''" /></div>
    </template>
    <template v-else-if="!leaders.leaders.counted">
      <div class="mt-0.5 mb-3.5"><AtomsWebHint :text="leadersOf(leaders.leadersMonth)" /></div>
      <AtomsWebFigure size="tile" tone="muted" :value="DASH" />
      <div class="mt-auto pt-2.5">
        <AtomsWebHint :text="`Не считаем: ${collectedText(leaders.leaders.coverage)} — лидеры по неполному месяцу случайны.`" />
      </div>
    </template>
    <template v-else>
      <div class="mt-0.5 mb-3.5">
        <AtomsWebHint
          :text="`${leadersOf(leaders.leadersMonth)} — из ${formatNumber(leaders.leaders.driversOnLine)} ${pluralize(leaders.leaders.driversOnLine, 'водителя', 'водителей', 'водителей')} на линии`"
        />
      </div>
      <AtomsWebFigure
        size="tile"
        :value="formatNumber(leaders.leaders.leaders)"
        :unit="pluralize(leaders.leaders.leaders, 'водитель', 'водителя', 'водителей')"
      />
      <div v-if="share" class="mt-auto">
        <div class="mb-2 flex justify-between font-manrope text-[14px] font-semibold text-web-title">
          <span class="text-web-cyan">Их поездки {{ share.theirs }} %</span>
          <span>Остальные {{ share.others }} %</span>
        </div>
        <div class="flex h-[22px] gap-1" aria-hidden="true">
          <i v-if="share.theirs > 0" class="basis-0 rounded-lg bg-web-cyan" :style="{ flexGrow: share.theirs }" />
          <i v-if="share.others > 0" class="basis-0 rounded-lg bg-web-teal" :style="{ flexGrow: share.others }" />
        </div>
      </div>
    </template>
  </MoleculesWebTile>

  <!-- Лидеры ездят меньше обычного -->
  <MoleculesWebTile
    :cols="4"
    :rows="2"
    title="Лидеры ездят меньше обычного"
    :metric="leaders ? 'leadersSlipping' : undefined"
    :metric-values="metricValues"
  >
    <div v-if="state === 'loading'" class="mt-3"><AtomsWebHint :text="LOADING_TEXT" /></div>
    <div v-else-if="state === 'error' || !leaders" class="mt-3"><AtomsWebHint :text="ERROR_TEXT" /></div>
    <template v-else-if="leaders.noLeaders || !leaders.slipping">
      <AtomsWebFigure class="mt-3" size="tile" tone="muted" :value="DASH" />
      <div class="mt-auto pt-2.5"><AtomsWebHint :text="firstMonthNote ?? ''" /></div>
    </template>
    <template v-else>
      <div class="mt-0.5 mb-3.5">
        <AtomsWebHint :text="`${leadersOf(leaders.leadersMonth)}, ${asOfText(leaders)}`" />
      </div>
      <template v-if="!leaders.slipping.counted">
        <AtomsWebFigure size="tile" tone="muted" :value="DASH" />
        <div class="mt-auto pt-2.5">
          <AtomsWebHint
            :text="`Не считаем: в неделях ${incompleteMonthsText(leaders.slipping.coverage)} собраны не все сутки, и пропуск выглядел бы как «перестал ездить».`"
          />
        </div>
      </template>
      <template v-else>
        <div class="flex items-baseline gap-[22px] whitespace-nowrap">
          <AtomsWebFigure
            size="tile"
            :value="formatNumber(leaders.slipping.below)"
            :unit="pluralize(leaders.slipping.below, 'ездит меньше', 'ездят меньше', 'ездят меньше')"
          />
          <AtomsWebFigure
            size="tile"
            :value="formatNumber(leaders.slipping.stopped)"
            :unit="pluralize(leaders.slipping.stopped, 'перестал', 'перестали', 'перестали')"
          />
        </div>
        <div v-if="leaders.slipping.below + leaders.slipping.stopped === 0 && thresholdLine" class="mt-auto pt-2.5">
          <AtomsWebHint :text="`Никто не ездит ${thresholdLine.below} ${thresholdLine.streak} подряд`" />
        </div>
        <template v-else-if="thresholdLine">
          <span class="mt-1.5 font-manrope text-[14px] font-semibold text-web-title">
            {{ thresholdLine.below }} <b class="font-bold">{{ thresholdLine.streak }}</b> подряд
          </span>
          <div class="mt-auto pt-2.5"><AtomsWebHint text="Поимённо — в списке ниже" /></div>
        </template>
      </template>
    </template>
  </MoleculesWebTile>

  <!-- Из лидеров ушли -->
  <MoleculesWebTile :cols="4" :rows="2" title="Из лидеров ушли" :metric="leaders ? 'leadersLeft' : undefined">
    <div v-if="state === 'loading'" class="mt-3"><AtomsWebHint :text="LOADING_TEXT" /></div>
    <div v-else-if="state === 'error' || !leaders" class="mt-3"><AtomsWebHint :text="ERROR_TEXT" /></div>
    <template v-else-if="leaders.noLeaders || !leaders.left">
      <AtomsWebFigure class="mt-3" size="tile" tone="muted" :value="DASH" />
      <div class="mt-auto pt-2.5"><AtomsWebHint :text="firstMonthNote ?? cohortUnavailableText ?? ''" /></div>
    </template>
    <template v-else>
      <div class="mt-0.5 mb-3.5"><AtomsWebHint :text="cohortNote ?? ''" /></div>
      <template v-if="!leaders.left.counted">
        <AtomsWebFigure size="tile" tone="muted" :value="DASH" />
        <div class="mt-auto pt-2.5">
          <AtomsWebHint
            :text="`Не считаем: ${collectedText(leaders.left.coverage)} — без собранного месяца ушедшими выглядели бы все.`"
          />
        </div>
      </template>
      <template v-else>
        <AtomsWebFigure
          size="tile"
          :value="formatNumber(leaders.left.left)"
          :unit="`из ${formatNumber(leaders.left.leaders)}`"
        />
        <span class="mt-1.5 font-manrope text-[14px] font-semibold text-web-title">
          <template v-if="leaders.left.left > 0">
            <b class="font-bold text-web-scarlet">{{ formatNumber(-leaders.left.trips) }}</b>
            {{ pluralize(leaders.left.trips, 'поездка', 'поездки', 'поездок') }} — столько они сделали в
            {{ monthForms(leaders.cohortMonth).prepositional }}
          </template>
          <template v-else>
            все лидеры {{ monthForms(leaders.cohortMonth).genitive }} ездили в
            {{ monthForms(shiftMonth(leaders.cohortMonth, 1)).prepositional }}
          </template>
        </span>
        <div class="mt-auto pt-2.5"><AtomsWebHint text="Ездил в прошлом месяце, в этом нет" /></div>
      </template>
    </template>
  </MoleculesWebTile>
</template>
