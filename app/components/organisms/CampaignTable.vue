<script setup lang="ts">
import { DASH, formatDate, formatDayRange, formatNumber } from '~/utils/format';
import { campaignStatusLabel, campaignStatusTone } from '~/utils/labels';
import type { LoadState } from '~/types/loadState';
import type { Campaign } from '#shared/types/campaign';

/**
 * Список акций: название, статус, окно половины А, сегмент и сколько человек попало в снимок.
 *
 * Размер снимка — факт на дату запуска, а не счётчик: у черновика его нет, и стоит прочерк,
 * а не ноль — «никого не сняли» и «ещё не снимали» разные вещи.
 */
defineProps<{
  state: LoadState;
  campaigns: Campaign[] | null;
}>();
</script>

<template>
  <MoleculesSectionPanel
    title="Акции"
    note="Состав акции снимается из сегмента в момент запуска и дальше не пересчитывается."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем акции…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Акции не прочитались. Это отказ запроса, а не отсутствие акций."
    />
    <MoleculesStateNotice
      v-else-if="!campaigns || campaigns.length === 0"
      state="empty"
      message="Акций ещё не заводили."
    />
    <ul v-else>
      <li
        v-for="campaign in campaigns"
        :key="campaign.campaignId"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 py-3 first:border-t-0"
      >
        <div class="min-w-48 flex-1">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <NuxtLink
              :to="`/campaigns/${campaign.campaignId}`"
              class="text-sm font-semibold text-slate-900 underline underline-offset-2 hover:text-slate-600"
            >
              {{ campaign.title ?? 'Без названия' }}
            </NuxtLink>
            <AtomsStatusBadge
              :tone="campaignStatusTone(campaign.status)"
              :label="campaignStatusLabel(campaign.status)"
            />
            <AtomsStatusBadge v-if="campaign.isDemo" tone="demo" label="ДЕМО" />
          </div>
          <p class="mt-0.5 text-xs text-slate-500">
            Окно половины А: {{ formatDayRange(campaign.halfA.startsOn, campaign.halfA.endsOn) }}
            · сегмент: {{ campaign.segment?.name ?? DASH }}
          </p>
          <p class="mt-0.5 text-xs text-slate-400">
            <template v-if="campaign.launchedAt">Запущена {{ formatDate(campaign.launchedAt) }}</template>
            <template v-else>Заведена {{ formatDate(campaign.createdAt) }}</template>
            · {{ campaign.createdByName }}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-slate-500">в снимке</p>
          <p class="font-mono text-sm text-slate-900 tabular-nums">
            {{ campaign.audienceSize === null ? DASH : formatNumber(campaign.audienceSize) }}
          </p>
        </div>
      </li>
    </ul>
  </MoleculesSectionPanel>
</template>
