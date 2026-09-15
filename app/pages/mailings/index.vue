<script setup lang="ts">
import { computed } from 'vue';
import { toLoadState } from '~/utils/loadState';
import type { MailingListResponse } from '#shared/types/mailing';

/**
 * Раздел «Рассылки»: список и вход в заведение черновика (issue #136).
 *
 * Формы заведения здесь больше нет: новая рассылка открывается экраном рассылки
 * (`/mailings/new`), где черновик заводится первым набранным символом или выбранным фото,
 * а тексты, фото и запуск живут на одном экране (issue #148). Открыл и ушёл — записи нет.
 */

definePageMeta({
  middleware: 'mailings-access',
});

useHead({ title: 'Рассылки — XalqBonus' });

const { data, status } = await useFetch<MailingListResponse>('/api/mailings');

const state = computed(() => toLoadState(status.value));
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Рассылки</h1>
        <p class="mt-1 text-sm text-slate-500">
          Сообщение всем участникам программы в Telegram с кнопкой «Открыть приложение». Черновик
          правится сколько угодно; отправленное не отзывается.
        </p>
      </div>
      <AtomsActionButton
        label="Новая рассылка"
        tone="primary"
        @click="navigateTo('/mailings/new')"
      />
    </div>

    <OrganismsMailingTable :state="state" :mailings="data?.mailings ?? null" />
  </div>
</template>
