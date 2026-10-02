<script setup lang="ts">
import { computed } from 'vue';
import { toLoadState } from '~/utils/loadState';
import type { SurveyListResponse } from '#shared/types/survey';

/**
 * Вкладка «Опросы» раздела «Рассылки» (issue #320): список и вход в заведение черновика.
 *
 * Новый опрос открывается экраном опроса (`/mailings/surveys/new`), где черновик заводится
 * первым набранным символом (issue #148). Открыл и ушёл — записи нет.
 */

definePageMeta({
  middleware: 'mailings-access',
});

useHead({ title: 'Опросы — Xalq Taxi Bonus' });

const { data, status } = await useFetch<SurveyListResponse>('/api/surveys');

const state = computed(() => toLoadState(status.value));
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-4">
      <h1 class="text-xl font-semibold text-slate-900">Рассылки</h1>
      <OrganismsMailingTabs active="surveys" />
    </div>

    <div class="flex flex-wrap items-start justify-between gap-4">
      <p class="text-sm text-slate-500">
        Опрос заводится здесь и уходит водителям рассылкой; один опрос может уйти несколькими
        рассылками. Все тексты — на русском и узбекском.
      </p>
      <AtomsActionButton
        label="Новый опрос"
        tone="primary"
        @click="navigateTo('/mailings/surveys/new')"
      />
    </div>

    <OrganismsSurveyTable :state="state" :surveys="data?.surveys ?? null" />
  </div>
</template>
