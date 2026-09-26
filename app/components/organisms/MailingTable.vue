<script setup lang="ts">
import { formatDate, formatNumber } from '~/utils/format';
import { mailingStatusLabel, mailingStatusTone } from '~/utils/labels';
import type { Mailing } from '#shared/types/mailing';
import type { LoadState } from '~/types/loadState';

/**
 * Список рассылок: заголовок, статус, дата и четыре главных счётчика.
 *
 * Дата — запуска, а у черновика — заведения: для идущей и прошедшей рассылки вопрос «когда»
 * значит «когда ушла», а черновику уходить ещё некуда.
 */
defineProps<{
  state: LoadState;
  mailings: Mailing[] | null;
}>();
</script>

<template>
  <MoleculesSectionPanel
    title="Рассылки"
    note="Счётчики считаются по снимку адресатов, снятому при запуске: вступившие в программу позже в рассылку не попадают."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем рассылки…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Рассылки не прочитались. Это отказ запроса, а не отсутствие рассылок."
    />
    <MoleculesStateNotice
      v-else-if="!mailings || mailings.length === 0"
      state="empty"
      message="Рассылок ещё не было."
    />
    <ul v-else>
      <li
        v-for="mailing in mailings"
        :key="mailing.mailingId"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 py-3 first:border-t-0"
      >
        <div class="min-w-48 flex-1">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <NuxtLink
              :to="`/mailings/${mailing.mailingId}`"
              class="text-sm font-semibold text-slate-900 underline underline-offset-2 hover:text-slate-600"
            >
              {{ mailing.title ?? 'Без заголовка' }}
            </NuxtLink>
            <AtomsStatusBadge
              :tone="mailingStatusTone(mailing.status)"
              :label="mailingStatusLabel(mailing.status)"
            />
            <AtomsStatusBadge v-if="mailing.isDemo" tone="demo" label="ДЕМО" />
          </div>
          <p class="mt-0.5 text-xs text-slate-500">
            <template v-if="mailing.startedAt">Запущена {{ formatDate(mailing.startedAt) }}</template>
            <template v-else>Заведена {{ formatDate(mailing.createdAt) }}</template>
            · {{ mailing.createdByName }}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-slate-500">адресатов / отправлено / канал умер / отключили уведомления</p>
          <p class="font-mono text-sm text-slate-900 tabular-nums">
            {{ formatNumber(mailing.counters.total) }} / {{ formatNumber(mailing.counters.sent) }} /
            {{ formatNumber(mailing.counters.invalidChat) }} /
            {{ formatNumber(mailing.counters.skippedDisabled) }}
          </p>
        </div>
      </li>
    </ul>
  </MoleculesSectionPanel>
</template>
