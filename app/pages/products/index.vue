<script setup lang="ts">
import { computed } from 'vue';
import { toLoadState } from '~/utils/loadState';
import type { ProductListResponse } from '#shared/types/catalog';

/**
 * Раздел «Каталог»: список товаров и вход в заведение нового.
 *
 * Формы заведения здесь больше нет: новый товар открывается экраном товара (`/products/new`),
 * где черновик заводится первым набранным символом или выбранным фото и дальше дописывается
 * на месте — вместе с картинкой (issue #148). Открыл и ушёл — записи нет.
 */

definePageMeta({
  middleware: 'catalog-access',
});

useHead({ title: 'Каталог — XalqBonus' });

const { data, status } = await useFetch<ProductListResponse>('/api/products');

const state = computed(() => toLoadState(status.value));
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Каталог</h1>
        <p class="mt-1 text-sm text-slate-500">
          Что водитель меняет на баллы. Цена в баллах — чем он платит; розница и закупка в сумах
          нужны отчёту парку о стоимости балла.
        </p>
      </div>
      <AtomsActionButton label="Новый товар" tone="primary" @click="navigateTo('/products/new')" />
    </div>

    <OrganismsProductTable :state="state" :data="data ?? null" />
  </div>
</template>
