<script setup lang="ts">
import { computed, ref } from 'vue';
import { failureText } from '~/utils/requestError';
import { toLoadState } from '~/utils/loadState';
import type {
  ProductListResponse,
  ProductRequestBody,
  ProductResponse,
} from '#shared/types/catalog';

/**
 * Раздел «Каталог»: список товаров и заведение нового.
 *
 * Фото и архив живут на странице товара: фото — файл и уезжает своим запросом, а архив —
 * решение, и обоим не место в форме заведения.
 */

definePageMeta({
  middleware: 'catalog-access',
});

useHead({ title: 'Каталог — XalqBonus' });

const { data, status, refresh } = await useFetch<ProductListResponse>('/api/products');

const state = computed(() => toLoadState(status.value));

const saving = ref(false);
const saveError = ref<string | null>(null);

/**
 * Заведение товара ведёт на его страницу: следующее действие — загрузить фото, и оно там.
 * Список при этом перечитывается: порядок в нём задаёт сервер.
 */
const create = async (body: ProductRequestBody): Promise<void> => {
  saving.value = true;
  saveError.value = null;

  try {
    const created = await $fetch<ProductResponse>('/api/products', { method: 'POST', body });

    await refresh();
    await navigateTo(`/products/${created.product.productId}`);
  } catch (error) {
    saveError.value = failureText(error);
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-slate-900">Каталог</h1>
      <p class="mt-1 text-sm text-slate-500">
        Что водитель меняет на баллы. Цена в баллах — чем он платит; розница и закупка в сумах
        нужны отчёту парку о стоимости балла.
      </p>
    </div>

    <OrganismsProductTable :state="state" :data="data ?? null" />

    <OrganismsProductForm
      title="Новый товар"
      submit-label="Завести товар"
      :product="null"
      :saving="saving"
      :error="saveError"
      @submit="create"
    />
  </div>
</template>
