<script setup lang="ts">
import { computed, ref } from 'vue';
import { DISPLAY_TIME_ZONE_LABEL } from '~/utils/format';
import { toLoadState } from '~/utils/loadState';

/**
 * Экран «Синхронизация»: после него на вопрос «работает ли синхронизация» отвечают
 * глазами, а не запросом в psql.
 *
 * Данные берутся здесь, а не в компонентах: компонент принимает готовое свойством
 * и о ручках не знает. Отсутствие данных приводится к `null` прямо в разметке: `useFetch`
 * называет его `undefined`, и тащить это различие в свойства компонентов незачем — оно
 * означает ровно одно и то же. Четыре запроса, а не один, — у блоков разная цена и разное
 * листание, и валить их в одну ручку значило бы пересчитывать свод при каждом
 * перелистывании журнала.
 */

useHead({ title: 'Синхронизация — XalqBonus' });

/** Сколько строк журнала и пропущенного на странице. */
const RUNS_LIMIT = 20;
const SKIPS_LIMIT = 50;

const runsOffset = ref(0);
const skipsOffset = ref(0);

const { data: watermarks, status: watermarksStatus } = await useFetch('/api/sync/state');
const { data: summary, status: summaryStatus } = await useFetch('/api/sync/summary');
const { data: runs, status: runsStatus } = await useFetch('/api/sync/runs', {
  query: { limit: RUNS_LIMIT, offset: runsOffset },
});
const { data: skips, status: skipsStatus } = await useFetch('/api/sync/skips', {
  query: { limit: SKIPS_LIMIT, offset: skipsOffset },
});

const watermarksState = computed(() => toLoadState(watermarksStatus.value));
const summaryState = computed(() => toLoadState(summaryStatus.value));
const runsState = computed(() => toLoadState(runsStatus.value));
const skipsState = computed(() => toLoadState(skipsStatus.value));
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-slate-900">Синхронизация</h1>
      <p class="mt-1 text-sm text-slate-500">
        Что синхронизация думает о себе: докуда дошло окно, что сделали прогоны и что
        не записалось.
      </p>
      <!-- Зона названа на экране: стенд может стоять в любой зоне, а сверяют числа
           с рабочим днём в Ташкенте, и догадываться о том, чьё это время, не должен никто. -->
      <p class="mt-1 text-xs text-slate-400">Время показано в зоне {{ DISPLAY_TIME_ZONE_LABEL }}</p>
    </div>

    <OrganismsSyncWatermarks :state="watermarksState" :data="watermarks ?? null" />
    <OrganismsSyncSummary :state="summaryState" :data="summary ?? null" />
    <OrganismsSyncRunJournal
      :state="runsState"
      :data="runs ?? null"
      @page="runsOffset = $event"
    />
    <OrganismsSyncSkips :state="skipsState" :data="skips ?? null" @page="skipsOffset = $event" />
  </div>
</template>
