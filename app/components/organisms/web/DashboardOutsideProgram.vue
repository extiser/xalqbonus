<script setup lang="ts">
import { computed } from 'vue';
import { formatNumber } from '~/utils/format';
import type { LoadState } from '~/types/loadState';
import type { DashboardOutsideProgram } from '#shared/types/dashboard';

/**
 * Плитка «Вне программы» вкладки «Глубина» (issue #373) — экрана
 * `_reference/design/web/dashboard/03-depth.html`, 4 × 3.
 *
 * Сколько водителей на линии ни разу не привязали Telegram, и какая доля поездок месяца на них —
 * подписями и полосой доли, как `.share` макета: их часть циановая — она про «сейчас», часть
 * участников бирюзовая. Справа в шапке — «Выгрузить в Excel»: эти водители за тот же месяц
 * (кнопка выгрузки называет формат, issue #402).
 * Водителей вне программы нет — кнопки нет: скачивать нечего.
 *
 * Данные — свойством: сама плитка в сеть не ходит (docs/frontend.md).
 */
const props = defineProps<{
  state: LoadState;
  /** Месяц `YYYY-MM` — за него скачивается список. */
  month: string | null;
  outside: DashboardOutsideProgram | null;
}>();

const ready = computed(() => (props.state === 'ready' ? props.outside : null));

const downloadUrl = computed(() =>
  props.month ? `/api/dashboard/outside-program/export?${new URLSearchParams({ month: props.month }).toString()}` : null,
);

/** Доля их поездок процентом до целого; участникам — остаток до ста, чтобы подписи сходились. */
const share = computed(() => {
  const outside = ready.value;

  if (!outside || outside.allTrips === 0) return null;

  const theirs = Math.round((outside.trips / outside.allTrips) * 100);

  return { theirs, members: 100 - theirs };
});
</script>

<template>
  <MoleculesWebTile :cols="4" :rows="3" title="Вне программы" metric="outsideProgram">
    <template #aside>
      <AtomsWebActionButton
        v-if="ready && ready.drivers > 0 && downloadUrl"
        label="Выгрузить в Excel"
        :download="downloadUrl"
      />
    </template>
    <div v-if="state === 'loading'" class="mt-3">
      <AtomsWebHint text="Считаем водителей…" />
    </div>
    <div v-else-if="state === 'error' || !ready" class="mt-3">
      <AtomsWebHint text="Водители не загрузились. Это отказ запроса, а не пустой месяц." />
    </div>
    <template v-else>
      <AtomsWebFigure
        class="mt-3"
        size="tile"
        :value="formatNumber(ready.drivers)"
        :unit="`из ${formatNumber(ready.driversOnLine)} на линии`"
      />
      <div v-if="share" class="mt-[18px]">
        <div class="mb-2 flex justify-between font-manrope text-[14px] font-semibold text-web-title">
          <span class="text-web-cyan">Их поездки {{ share.theirs }} %</span>
          <span>Участники {{ share.members }} %</span>
        </div>
        <div class="flex h-[22px] gap-1" aria-hidden="true">
          <i v-if="share.theirs > 0" class="basis-0 rounded-lg bg-web-cyan" :style="{ flexGrow: share.theirs }" />
          <i v-if="share.members > 0" class="basis-0 rounded-lg bg-web-teal" :style="{ flexGrow: share.members }" />
        </div>
      </div>
      <div class="mt-auto pt-2.5">
        <AtomsWebHint
          text="Ездят, но ни разу не привязали Telegram. В списке — позывной, имя, телефон, поездок за месяц и последняя поездка"
        />
      </div>
    </template>
  </MoleculesWebTile>
</template>
