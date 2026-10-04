<script setup lang="ts">
import { computed } from 'vue';
import { formatNumber, formatWholeShare, pluralize } from '~/utils/format';
import type { MetricKey } from '#shared/metrics';
import type { PromoCard } from '#shared/types/promo';

/**
 * Плитка «Воронка · за всё время» карточки метки (issue #380) — `03-card.html`, 8 × 3.
 *
 * Три шага полосками: перешли — вся полоса, вступили и первая поездка — долей от перешедших;
 * под полосой — доля от предыдущего шага; не от чего считать — подписи нет. Цвет от прошлого к «сейчас»: бирюзовый, средний
 * бирюзовый, циан. «Уже были в программе» — отдельной строкой цветом названия: это не результат
 * метки. Последняя строка — сколько раз открыли бота — прижата к низу, на одной линии с кнопками
 * соседней плитки (`codex.md`).
 */
const props = defineProps<{
  funnel: PromoCard['funnel'];
}>();

type FunnelStep = {
  label: string;
  metric: MetricKey;
  value: number;
  /** Ширина полосы, % от перешедших. */
  width: number;
  barClass: string;
  note: string | null;
};

const steps = computed<FunnelStep[]>(() => {
  const { went, joined, firstTrip } = props.funnel;
  const widthOf = (value: number): number => (went > 0 ? (value / went) * 100 : 0);

  return [
    { label: 'Перешли', metric: 'promoWent', value: went, width: widthOf(went), barClass: 'bg-web-teal', note: null },
    {
      label: 'Вступили',
      metric: 'promoJoined',
      value: joined,
      width: widthOf(joined),
      barClass: 'bg-web-teal-mid',
      note: went > 0 ? `${formatWholeShare(joined, went)} от перешедших` : null,
    },
    {
      label: 'Первая поездка',
      metric: 'promoFirstTrip',
      value: firstTrip,
      width: widthOf(firstTrip),
      barClass: 'bg-web-cyan',
      note: joined > 0 ? `${formatWholeShare(firstTrip, joined)} от вступивших` : null,
    },
  ];
});

const touchesText = computed(() => {
  const touches = props.funnel.touches;

  return `Открыли бота ${formatNumber(touches)} ${pluralize(touches, 'раз', 'раза', 'раз')} — некоторые по нескольку раз; в «перешли» каждый человек один раз.`;
});
</script>

<template>
  <MoleculesWebTile :cols="8" :rows="3" title="Воронка · за всё время">
    <div
      v-for="step in steps"
      :key="step.metric"
      class="mt-6 grid grid-cols-[170px_minmax(0,1fr)_70px] items-center gap-x-4 gap-y-1 max-web:grid-cols-[minmax(0,1fr)_56px]"
    >
      <div class="font-manrope text-[15px] font-medium text-web-title">
        <MoleculesWebMetricLabel :label="step.label" :metric="step.metric" />
      </div>
      <div class="h-7 overflow-hidden rounded-lg bg-web-cyan/5 max-web:col-span-2 max-web:row-start-2" aria-hidden="true">
        <i class="block h-full rounded-lg" :class="step.barClass" :style="{ width: `${step.width}%` }" />
      </div>
      <div class="text-right font-unbounded text-[22px] font-bold text-web-text">{{ formatNumber(step.value) }}</div>
      <div v-if="step.note" class="col-start-2 col-end-4 -mt-0.5 font-manrope text-[12px] text-web-grey max-web:col-span-2 max-web:col-start-1">
        {{ step.note }}
      </div>
    </div>
    <div class="mt-[18px] flex justify-between border-t border-web-line pt-3.5 font-manrope text-[14px] font-medium text-web-title">
      <span><MoleculesWebMetricLabel label="Уже были в программе" metric="promoAlready" /></span>
      <b class="font-bold">{{ formatNumber(funnel.already) }}</b>
    </div>
    <div class="mt-auto pt-3">
      <AtomsWebHint :text="touchesText" />
    </div>
  </MoleculesWebTile>
</template>
