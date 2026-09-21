<script setup lang="ts">
import { computed } from 'vue';
import { DISPLAY_TIME_ZONE_LABEL, formatDateTime, formatNumber, pluralize } from '~/utils/format';
import type { LoadState } from '~/types/loadState';
import { SEGMENT_EMPTY_CONDITIONS_TEXT } from '#shared/segment';
import type { SegmentPreviewResponse } from '#shared/types/segment';

/**
 * Предпросмотр состава: число водителей и страница строк на сейчас.
 *
 * Подписан моментом расчёта и словами «на сейчас»: сегмент хранит условия, а не людей,
 * и завтра тот же сегмент даст другой состав — давность ползёт каждый день.
 *
 * Обещает он ровно одно — поймать сломанный фильтр: ноль или весь парк. Верны ли сами
 * границы, он не скажет, и примечание раздела говорит это прямо (issue #165).
 *
 * «Условий нет» и «никто не подошёл» — разные сообщения: первое — недоделанная форма,
 * второе — ответ.
 */
const props = defineProps<{
  state: LoadState;
  data: SegmentPreviewResponse | null;
  /** Текст отказа последнего пересчёта. */
  error: string | null;
  hasConditions: boolean;
  /** Пересчёт в пути поверх показанного: число стоит, пока не приехало новое. */
  refreshing: boolean;
  /** По чему посчитано: сохранённые условия сегмента или ещё не сохранённые из формы. */
  basis: 'saved' | 'draft';
}>();

const emit = defineEmits<{ page: [offset: number] }>();

const totalLabel = computed(() => {
  const total = props.data?.total ?? 0;

  return `${formatNumber(total)} ${pluralize(total, 'водитель', 'водителя', 'водителей')}`;
});

const basisLabel = computed(() =>
  props.basis === 'saved'
    ? 'по сохранённым условиям сегмента'
    : 'по условиям формы — они ещё не сохранены',
);
</script>

<template>
  <MoleculesSectionPanel
    title="Состав на сейчас"
    note="Состав считается в момент запроса и не хранится. Предпросмотр ловит сломанный фильтр — ноль или весь парк, — но не скажет, те ли границы заданы."
  >
    <MoleculesStateNotice
      v-if="!hasConditions"
      state="empty"
      :message="SEGMENT_EMPTY_CONDITIONS_TEXT"
    />
    <MoleculesStateNotice
      v-else-if="state === 'loading'"
      state="loading"
      message="Считаем состав…"
    />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      :message="error ?? 'Состав не посчитался. Это отказ запроса, а не пустой сегмент.'"
    />
    <div v-else-if="data" class="space-y-4">
      <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p class="font-mono text-2xl text-slate-900 tabular-nums">{{ totalLabel }}</p>
        <p class="text-sm text-slate-500">
          на {{ formatDateTime(data.calculatedAt) }} в зоне {{ DISPLAY_TIME_ZONE_LABEL }}, {{ basisLabel }}
        </p>
        <p v-if="refreshing" class="text-sm text-slate-400">пересчитываем…</p>
      </div>

      <MoleculesStateNotice
        v-if="data.total === 0"
        state="empty"
        message="Под эти условия сейчас не подходит ни один водитель."
      />
      <template v-else>
        <div>
          <MoleculesSegmentMemberItem
            v-for="member in data.rows"
            :key="member.personId"
            :member="member"
          />
        </div>
        <div class="border-t border-slate-200 pt-3">
          <MoleculesPagerBar
            :total="data.total"
            :limit="data.limit"
            :offset="data.offset"
            @change="emit('page', $event)"
          />
        </div>
      </template>
    </div>
  </MoleculesSectionPanel>
</template>
