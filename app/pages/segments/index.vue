<script setup lang="ts">
import { computed } from 'vue';
import { toLoadState } from '~/utils/loadState';
import type { SegmentListResponse } from '#shared/types/segment';

/**
 * Раздел «Сегменты»: список и вход в заведение нового (issue #165).
 *
 * Условия и предпросмотр состава живут на странице сегмента: список отвечает на вопрос
 * «какие срезы есть и сколько в них сейчас людей», а не на все вопросы сразу.
 */

definePageMeta({
  // Менеджеру раздел не открыт. Решают ручки, а не эта строка: она лишь уводит на его работу
  // вместо череды отказов (`app/middleware/segments-access.ts`).
  middleware: 'segments-access',
});

useHead({ title: 'Сегменты — XalqBonus' });

const { data, status } = await useFetch<SegmentListResponse>('/api/segments');

const state = computed(() => toLoadState(status.value));
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Сегменты</h1>
        <p class="mt-1 text-sm text-slate-500">
          Сохранённый отбор водителей по условиям: давность поездки, участие в программе,
          привязка Telegram, баланс. Сегмент выбирают рассылка и акция — состав каждый раз
          считается заново.
        </p>
      </div>
      <AtomsActionButton
        label="Новый сегмент"
        tone="primary"
        @click="navigateTo('/segments/new')"
      />
    </div>

    <OrganismsSegmentTable :state="state" :data="data ?? null" />
  </div>
</template>
