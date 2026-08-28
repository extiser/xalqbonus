<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SyncRunRow } from '#shared/types/sync';
import { formatDateTime, formatDuration, formatNumber, formatWindow } from '~/utils/format';
import { runKindLabel, runStatusLabel } from '~/utils/labels';

/**
 * Строка журнала прогонов с раскрытием разбора.
 *
 * Счётчики прогона показываются как есть и суммой ни во что не складываются: здесь вопрос
 * «что сделал этот прогон», и ответ на него — именно события. Различные сущности за период
 * считает свод, и он берёт их из таблиц данных.
 *
 * Отказ показан спокойным цветом вместе с текстом ошибки: за сутки падает восемь прогонов
 * из трёхсот семидесяти, все по лимиту Fleet API, и упавший прогон не двигает отметку —
 * следующий забирает то же окно и догоняет. Красный здесь один — у прогона, который висит
 * в `running` дольше законного: такой не закрывал сам себя и успешным не является.
 */
const props = defineProps<{
  run: SyncRunRow;
}>();

const expanded = ref(false);

const statusTone = computed<'ok' | 'warn' | 'alarm' | 'muted'>(() => {
  if (props.run.stalled) {
    return 'alarm';
  }

  if (props.run.status === 'failed') {
    return 'warn';
  }

  return props.run.status === 'running' ? 'muted' : 'ok';
});

const statusLabel = computed(() =>
  props.run.stalled ? 'оборван — висит в running' : runStatusLabel(props.run.status),
);

const hasDetails = computed(() => props.run.orders !== null || props.run.registry !== null);
</script>

<template>
  <article class="border-t border-slate-200 py-3 first:border-t-0 first:pt-0">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="text-sm font-semibold text-slate-900">{{ runKindLabel(run.kind) }}</span>
      <AtomsStatusBadge :tone="statusTone" :label="statusLabel" />
      <span class="font-mono text-sm text-slate-500 tabular-nums">
        {{ formatDateTime(run.startedAt) }}
      </span>
      <span class="font-mono text-sm text-slate-500 tabular-nums">
        {{ formatDuration(run.durationMs) }}{{ run.finishedAt ? '' : ' и идёт' }}
      </span>
    </div>

    <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-5">
      <div class="col-span-2 flex gap-2 sm:col-span-3 lg:col-span-2">
        <dt class="text-slate-500">Окно</dt>
        <dd class="font-mono text-slate-700 tabular-nums">
          {{ formatWindow(run.windowFrom, run.windowTo) }}
        </dd>
      </div>
      <div class="flex gap-2">
        <dt class="text-slate-500">Запросов</dt>
        <dd class="font-mono text-slate-700 tabular-nums">{{ formatNumber(run.requests) }}</dd>
      </div>
      <div class="flex gap-2">
        <dt class="text-slate-500">По лимиту</dt>
        <dd class="font-mono tabular-nums" :class="run.rateLimited > 0 ? 'text-amber-700' : 'text-slate-700'">
          {{ formatNumber(run.rateLimited) }}
        </dd>
      </div>
      <div class="flex gap-2">
        <dt class="text-slate-500">Увидено / записано</dt>
        <dd class="font-mono text-slate-700 tabular-nums">
          {{ formatNumber(run.itemsSeen) }} / {{ formatNumber(run.itemsWritten) }}
        </dd>
      </div>
    </dl>

    <p v-if="run.error" class="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
      {{ run.error }}
    </p>

    <div v-if="hasDetails" class="mt-2">
      <AtomsDisclosureButton
        :label="expanded ? 'Свернуть разбор' : 'Разбор прогона'"
        :expanded="expanded"
        @toggle="expanded = !expanded"
      />
    </div>

    <dl
      v-if="expanded && run.orders"
      class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
    >
      <MoleculesCounterTile label="Страниц" :value="run.orders.pages" />
      <MoleculesCounterTile label="Вставлено" :value="run.orders.ordersInserted" />
      <MoleculesCounterTile label="Обновлено" :value="run.orders.ordersUpdated" />
      <MoleculesCounterTile label="Начислено" :value="run.orders.awarded" />
      <MoleculesCounterTile
        label="Уже начислено"
        :value="run.orders.alreadyAwarded"
        hint="повтор по ключу, баланс не тронут"
      />
      <MoleculesCounterTile
        label="Вне программы"
        :value="run.orders.outsideProgram"
        hint="известен парку, но не в программе"
      />
      <MoleculesCounterTile
        label="Не завершено"
        :value="run.orders.notCompleted"
        hint="вернётся позже со временем завершения"
      />
      <MoleculesCounterTile
        label="Без времени завершения"
        :value="run.orders.withoutEndedAt"
        hint="статус complete, начислять не от чего"
      />
      <MoleculesCounterTile
        label="Не разобрано"
        :value="run.orders.malformed"
        hint="не хватило обязательного поля"
      />
      <MoleculesCounterTile
        label="Пропущено: нет водителя"
        :value="run.orders.skippedUnknownProfile"
        hint="заказов"
      />
      <MoleculesCounterTile
        label="Неизвестных водителей"
        :value="run.orders.unknownProfiles"
        hint="различных профилей за предыдущим числом"
      />
      <MoleculesCounterTile
        label="Нет поездки"
        :value="run.orders.unknownTrip"
        hint="заказа нет в xb.trips"
      />
    </dl>

    <dl
      v-if="expanded && run.registry"
      class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
    >
      <MoleculesCounterTile label="Страниц" :value="run.registry.pages" />
      <MoleculesCounterTile
        label="Различных профилей"
        :value="run.registry.profilesSeen"
        hint="сколько водителей показал API"
      />
      <MoleculesCounterTile
        label="Строк ответа"
        :value="run.registry.responseRows"
        hint="цена обхода: половины кусков перекрываются"
      />
      <MoleculesCounterTile label="Новых профилей" :value="run.registry.profilesInserted" />
      <MoleculesCounterTile
        label="Подтверждено профилей"
        :value="run.registry.profilesUpdated"
        hint="уже были в реестре"
      />
      <MoleculesCounterTile label="Новых людей" :value="run.registry.personsCreated" />
      <MoleculesCounterTile label="Смен статуса" :value="run.registry.statusEvents" />
      <MoleculesCounterTile
        label="Телефонов открыто / закрыто"
        :value="run.registry.phonesOpened"
        :hint="`закрыто ${run.registry.phonesClosed}`"
      />
      <MoleculesCounterTile label="ВУ обновлено" :value="run.registry.licensesUpdated" />
      <MoleculesCounterTile
        label="Конфликтов ВУ"
        :value="run.registry.licenseConflicts"
        hint="номер активен у другого человека"
      />
      <MoleculesCounterTile
        label="Без ВУ"
        :value="run.registry.skippedWithoutLicense"
        hint="профиль не заведён"
      />
      <MoleculesCounterTile label="Не разобрано" :value="run.registry.malformed" />
      <MoleculesCounterTile
        label="Разрешено пропущенного"
        :value="run.registry.resolvedSkips"
        hint="заказы, чей водитель нашёлся"
      />
      <MoleculesCounterTile
        label="Кусков обхода"
        :value="run.registry.chunksTotal"
        hint="у инкрементального прогона нарезки нет"
      />
      <MoleculesCounterTile
        label="Дробилось окнами"
        :value="run.registry.chunksWindowed"
        hint="кусок не взялся сразу"
      />
      <MoleculesCounterTile
        label="Глубина offset"
        :value="run.registry.maxOffsetDepth"
        hint="рабочий предел 3 500"
      />
    </dl>
  </article>
</template>
