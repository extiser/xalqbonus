<script setup lang="ts">
import { computed } from 'vue';
import type { SyncWatermark } from '#shared/types/sync';
import { formatDateTime, formatDuration } from '~/utils/format';

/**
 * Отметка одного вида прогона.
 *
 * Состояний три. Выключенный вид прогона показывается спокойным и с явной подписью:
 * отставание у него штатно, и красный на нём означал бы поломку, которой нет. Красным
 * горит одно — отметка, не сдвинувшаяся дольше порога.
 *
 * У догона отметка — позиция прохода, и отставание от «сейчас» у неё на неделю штатно:
 * вместо него карточка показывает проход — его границы, докуда он пройден и идёт ли.
 */
const props = defineProps<{
  watermark: SyncWatermark;
}>();

const KIND_LABELS: Record<SyncWatermark['kind'], string> = {
  orders: 'Заказы',
  orders_catchup: 'Заказы, догоняющий',
  registry: 'Реестр',
  transactions: 'Транзакции',
};

const STATE_TONES: Record<SyncWatermark['state'], 'ok' | 'warn' | 'alarm' | 'muted'> = {
  ok: 'ok',
  stale: 'alarm',
  disabled: 'muted',
  never: 'warn',
};

const STATE_LABELS: Record<SyncWatermark['state'], string> = {
  ok: 'работает',
  stale: 'отстаёт',
  disabled: 'расписание выключено',
  never: 'отметки ещё нет',
};

const isCatchup = computed(() => props.watermark.kind === 'orders_catchup');

const passLabel = computed(() => {
  const { watermark: position, passTo } = props.watermark;

  if (!passTo) {
    return 'не начат';
  }

  return position !== null && new Date(position) >= new Date(passTo) ? 'пройден' : 'идёт';
});

const scheduleNote = computed(() =>
  props.watermark.scheduled
    ? `прогон раз в ${formatDuration(props.watermark.intervalSec * 1_000)}`
    : 'по расписанию не ходит, запускается командой',
);

const thresholdNote = computed(() => {
  if (!props.watermark.scheduled) {
    return 'отставание считается, но тревогой не является';
  }

  const threshold = formatDuration(props.watermark.staleThresholdMs);

  return isCatchup.value
    ? `тревога, если идущий проход стоит дольше ${threshold}`
    : `тревога после ${threshold} отставания`;
});
</script>

<template>
  <article class="rounded-lg border border-slate-200 bg-white px-4 py-3">
    <div class="flex items-start justify-between gap-3">
      <h3 class="text-sm font-semibold text-slate-900">{{ KIND_LABELS[watermark.kind] }}</h3>
      <AtomsStatusBadge
        :tone="STATE_TONES[watermark.state]"
        :label="STATE_LABELS[watermark.state]"
      />
    </div>

    <dl v-if="isCatchup" class="mt-3 space-y-1.5 text-sm">
      <div class="flex justify-between gap-3">
        <dt class="text-slate-500">Проход</dt>
        <dd class="text-right font-mono text-slate-900 tabular-nums">
          с {{ formatDateTime(watermark.passFrom) }}<br>
          по {{ formatDateTime(watermark.passTo) }}
        </dd>
      </div>
      <div class="flex justify-between gap-3">
        <dt class="text-slate-500">Пройдено до</dt>
        <dd class="font-mono text-slate-900 tabular-nums">
          {{ formatDateTime(watermark.watermark) }}
        </dd>
      </div>
      <div class="flex justify-between gap-3">
        <dt class="text-slate-500">Состояние прохода</dt>
        <dd class="text-slate-900">{{ passLabel }}</dd>
      </div>
      <div class="flex justify-between gap-3">
        <dt class="text-slate-500">Обновлена</dt>
        <dd class="font-mono tabular-nums" :class="watermark.state === 'stale' ? 'text-red-700' : 'text-slate-900'">
          {{ formatDateTime(watermark.updatedAt) }}
        </dd>
      </div>
    </dl>

    <dl v-else class="mt-3 space-y-1.5 text-sm">
      <div class="flex justify-between gap-3">
        <dt class="text-slate-500">Отметка</dt>
        <dd class="font-mono text-slate-900 tabular-nums">
          {{ formatDateTime(watermark.watermark) }}
        </dd>
      </div>
      <div class="flex justify-between gap-3">
        <dt class="text-slate-500">Отставание</dt>
        <dd class="font-mono tabular-nums" :class="watermark.state === 'stale' ? 'text-red-700' : 'text-slate-900'">
          {{ formatDuration(watermark.lagMs) }}
        </dd>
      </div>
      <div class="flex justify-between gap-3">
        <dt class="text-slate-500">Обновлена</dt>
        <dd class="font-mono text-slate-900 tabular-nums">
          {{ formatDateTime(watermark.updatedAt) }}
        </dd>
      </div>
    </dl>

    <p class="mt-3 text-xs text-slate-400">{{ scheduleNote }} · {{ thresholdNote }}</p>
  </article>
</template>
