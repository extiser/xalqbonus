<script setup lang="ts">
import { computed } from 'vue';
import { toLoadState } from '~/utils/loadState';
import type { CampaignListResponse } from '#shared/types/campaign';

/**
 * Раздел «Акции»: список и вход в заведение черновика (issue #166).
 *
 * Новая акция открывается экраном акции (`/campaigns/new`), где черновик заводится первым
 * действием, как у рассылки (issue #148). Открыл и ушёл — записи нет.
 */

definePageMeta({
  // Менеджеру раздел не открыт. Решают ручки, а не эта строка: она лишь уводит на его работу
  // вместо череды отказов (`app/middleware/campaigns-access.ts`).
  middleware: 'campaigns-access',
});

useHead({ title: 'Акции — XalqBonus' });

const { data, status } = await useFetch<CampaignListResponse>('/api/campaigns');

const state = computed(() => toLoadState(status.value));
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Акции</h1>
        <p class="mt-1 text-sm text-slate-500">
          Акция снимает состав из сегмента в момент запуска и идёт окном «с и до». Черновик
          правится сколько угодно; запуск необратим.
        </p>
      </div>
      <AtomsActionButton label="Новая акция" tone="primary" @click="navigateTo('/campaigns/new')" />
    </div>

    <OrganismsCampaignTable :state="state" :campaigns="data?.campaigns ?? null" />
  </div>
</template>
