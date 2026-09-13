<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { failureText } from '~/utils/requestError';
import { toLoadState } from '~/utils/loadState';
import type { ProductRequestBody, ProductResponse } from '#shared/types/catalog';

/**
 * Страница товара: правка, фото, архив.
 *
 * Фото уезжает своим запросом — `multipart/form-data` с одним файлом, — а не полем формы
 * правки: собрать в одном запросе шесть текстовых полей и файл можно, но тогда каждая правка
 * цены отправляла бы картинку заново.
 */

definePageMeta({
  middleware: 'catalog-access',
});

const route = useRoute();
const productId = computed(() => String(route.params.productId));

const { data, status, refresh } = await useFetch<ProductResponse>(
  () => `/api/products/${productId.value}`,
);

useHead({ title: () => `${data.value?.product.name ?? 'Товар'} — XalqBonus` });

const state = computed(() => toLoadState(status.value));
const archived = computed(() => data.value?.product.archivedAt !== null);

const saving = ref(false);
const saveError = ref<string | null>(null);

const save = async (body: ProductRequestBody): Promise<void> => {
  saving.value = true;
  saveError.value = null;

  try {
    await $fetch<ProductResponse>(`/api/products/${productId.value}`, { method: 'PATCH', body });
    await refresh();
  } catch (error) {
    saveError.value = failureText(error);
  } finally {
    saving.value = false;
  }
};

const toggleArchive = async (): Promise<void> => {
  saving.value = true;
  saveError.value = null;

  try {
    await $fetch<ProductResponse>(
      `/api/products/${productId.value}/${archived.value ? 'unarchive' : 'archive'}`,
      { method: 'POST' },
    );
    await refresh();
  } catch (error) {
    saveError.value = failureText(error);
  } finally {
    saving.value = false;
  }
};

const uploading = ref(false);
const photoError = ref<string | null>(null);

/**
 * Загрузка фото. Тело собирается `FormData`: заголовок `multipart/form-data` с границей
 * ставит браузер сам, и задавать его руками нельзя — граница в нём не совпадёт с телом.
 *
 * После ответа товар перечитывается: вместе с путём фото двигается `updated_at`, а он и есть
 * версия в адресе картинки. Без этого браузер показывал бы прежнюю — кэш у адреса длинный.
 */
const upload = async (file: File): Promise<void> => {
  uploading.value = true;
  photoError.value = null;

  const body = new FormData();

  body.append('photo', file);

  try {
    await $fetch<ProductResponse>(`/api/products/${productId.value}/photo`, {
      method: 'POST',
      body,
    });
    await refresh();
  } catch (error) {
    photoError.value = failureText(error);
  } finally {
    uploading.value = false;
  }
};
</script>

<template>
  <div class="space-y-6">
    <div>
      <NuxtLink to="/products" class="text-sm text-slate-500 underline underline-offset-2">
        ← Весь каталог
      </NuxtLink>
      <h1 class="mt-2 text-xl font-semibold text-slate-900">
        {{ data?.product.name ?? 'Товар' }}
      </h1>
      <p v-if="data?.product.archivedAt" class="mt-1 text-sm text-slate-500">
        Товар в архиве: водителю не показывается, но остаётся в истории заказов и в остатках.
      </p>
    </div>

    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем товар…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Товар не прочитался. Это отказ запроса, а не отсутствие товара."
    />
    <template v-else-if="data">
      <OrganismsProductForm
        title="Правка товара"
        submit-label="Сохранить"
        :product="data.product"
        :saving="saving"
        :error="saveError"
        @submit="save"
      />

      <OrganismsProductPhotoForm
        :product="data.product"
        :uploading="uploading"
        :error="photoError"
        @upload="upload"
      />

      <MoleculesSectionPanel
        title="Архив"
        note="Удаления нет: на товар ссылаются позиции заказов, и позиция обязана помнить, что именно было заказано."
      >
        <AtomsActionButton
          :label="archived ? 'Вернуть из архива' : 'Убрать в архив'"
          :tone="archived ? 'primary' : 'danger'"
          :disabled="saving"
          @click="toggleArchive"
        />
      </MoleculesSectionPanel>
    </template>
  </div>
</template>
