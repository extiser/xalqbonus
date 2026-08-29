<script setup lang="ts">
import { computed } from 'vue';
import type { DriverOperation } from '#shared/types/driver';
import { formatDateTime, formatMomentDate, formatSignedNumber } from '~/utils/format';
import { accountTypeLabel, pointReasonLabel, tripStatusLabel } from '~/utils/labels';

/**
 * Одна операция журнала по счёту водителя.
 *
 * Двойная запись не прячется: строка называет обе стороны перевода и показывает, откуда
 * и куда ушли баллы. Баллы не появляются и не исчезают — они перемещаются между счетами,
 * и «начислено 1» без ответа на вопрос «откуда» — это ровно тот журнал, которому нечем
 * сойтись (docs/points.md).
 */
const props = defineProps<{
  operation: DriverOperation;
}>();

/**
 * С какого расхождения времени операции и времени внесения запись считается сделанной
 * задним числом.
 *
 * Сутки, а не любое расхождение: у начисления за поездку между завершением заказа
 * и записью проходят минуты — окно опроса и очередь, — и подпись у каждой строки
 * превратилась бы в шум. Сутки и больше означают раздачу по кампании или перепроверку,
 * и вот о них смотрящий должен узнать, а не вычитать даты в уме.
 */
const BACKDATED_THRESHOLD_MS = 24 * 60 * 60 * 1_000;

const incoming = computed(() => props.operation.delta > 0);

/** Записана задним числом: время операции и время внесения разошлись больше чем на сутки. */
const backdated = computed(() => {
  const occurredAt = new Date(props.operation.occurredAt).getTime();
  const createdAt = new Date(props.operation.createdAt).getTime();

  return Math.abs(createdAt - occurredAt) > BACKDATED_THRESHOLD_MS;
});

/** Имя второй стороны: у системного счёта — его роль, у водительского — человек. */
const counterpartyTitle = computed(() => {
  const counterparty = props.operation.counterparty;

  return counterparty.type === 'driver'
    ? (counterparty.name ?? 'водитель без имени в реестре')
    : accountTypeLabel(counterparty.type);
});

/** Направление словами: слева источник, справа получатель. */
const direction = computed(() =>
  incoming.value
    ? `${counterpartyTitle.value} → счёт водителя`
    : `счёт водителя → ${counterpartyTitle.value}`,
);
</script>

<template>
  <article class="border-t border-slate-200 py-3 first:border-t-0 first:pt-0">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <AtomsStatusBadge tone="muted" :label="pointReasonLabel(operation.reason)" />
      <!-- Массовая раздача помечена своей меткой: три тысячи начислений одной кампании
           не должны читаться как три тысячи независимых решений оператора. -->
      <AtomsStatusBadge
        v-if="operation.campaignSlug"
        tone="warn"
        :label="`кампания ${operation.campaignSlug}`"
      />
      <span
        class="font-mono text-sm font-semibold tabular-nums"
        :class="incoming ? 'text-emerald-700' : 'text-red-700'"
      >
        {{ formatSignedNumber(operation.delta) }}
      </span>
      <span class="font-mono text-sm text-slate-500 tabular-nums">
        {{ formatDateTime(operation.occurredAt) }}
      </span>
      <span class="text-sm text-slate-500">{{ direction }}</span>
    </div>

    <!-- Список отсортирован по времени операции, и запись задним числом встаёт в нём
         по своей дате — среди чужих строк того дня. Без этой подписи подарок ко Дню
         независимости не отличить от начисления, сделанного тогда же. -->
    <p v-if="backdated" class="mt-0.5 text-xs text-slate-400">
      внесено {{ formatMomentDate(operation.createdAt) }}
    </p>

    <dl class="mt-1 grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-2">
      <div class="flex gap-2">
        <dt class="shrink-0 text-slate-500">Ключ</dt>
        <dd class="font-mono break-all text-slate-700">{{ operation.idempotencyKey }}</dd>
      </div>
      <div class="flex gap-2">
        <dt class="shrink-0 text-slate-500">Вторая запись</dt>
        <!-- Пусто здесь означает потерянную половину перевода — первый инвариант журнала.
             Прятать это нельзя: экран, скрывающий битую запись, бесполезен там, где нужен. -->
        <dd
          class="font-mono tabular-nums"
          :class="operation.counterparty.delta === null ? 'text-red-700' : 'text-slate-700'"
        >
          <template v-if="operation.counterparty.delta === null">
            записи нет — половина перевода потеряна
          </template>
          <template v-else>{{ formatSignedNumber(operation.counterparty.delta) }}</template>
        </dd>
      </div>
      <div v-if="operation.legacyOrderId !== null" class="flex gap-2">
        <dt class="shrink-0 text-slate-500">Заказ товара</dt>
        <dd class="font-mono text-slate-700 tabular-nums">{{ operation.legacyOrderId }}</dd>
      </div>
      <div v-if="operation.actor" class="flex gap-2">
        <dt class="shrink-0 text-slate-500">Кто</dt>
        <dd class="text-slate-700">{{ operation.actor }}</dd>
      </div>
    </dl>

    <p v-if="operation.note" class="mt-1 text-sm text-slate-500">{{ operation.note }}</p>

    <!-- Операция за поездку ведёт к заказу: без него «плюс балл» нечем проверить. -->
    <dl
      v-if="operation.trip"
      class="mt-2 grid grid-cols-1 gap-x-6 gap-y-0.5 rounded-md bg-slate-50 px-3 py-2 text-sm sm:grid-cols-2"
    >
      <div class="flex gap-2">
        <dt class="shrink-0 text-slate-500">Заказ</dt>
        <dd class="font-mono break-all text-slate-700">{{ operation.trip.orderId }}</dd>
      </div>
      <div class="flex gap-2">
        <dt class="shrink-0 text-slate-500">Завершён</dt>
        <dd class="font-mono text-slate-700 tabular-nums">
          {{ formatDateTime(operation.trip.endedAt) }}
        </dd>
      </div>
      <div class="flex gap-2">
        <dt class="shrink-0 text-slate-500">Статус</dt>
        <dd class="text-slate-700">{{ tripStatusLabel(operation.trip.status) }}</dd>
      </div>
      <div class="flex gap-2">
        <dt class="shrink-0 text-slate-500">Стоимость</dt>
        <dd class="font-mono text-slate-700 tabular-nums">{{ operation.trip.price }}</dd>
      </div>
    </dl>

    <p
      v-else-if="operation.tripOrderId"
      class="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
    >
      Заказ <span class="font-mono">{{ operation.tripOrderId }}</span> в базе поездок
      не найден: балл начислен, а поездки нет — это повод разобрать.
    </p>
  </article>
</template>
