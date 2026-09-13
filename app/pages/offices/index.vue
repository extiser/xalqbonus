<script setup lang="ts">
import { computed, ref } from 'vue';
import { failureText } from '~/utils/requestError';
import { toLoadState } from '~/utils/loadState';
import type { OfficeListResponse, OfficeRequestBody, OfficeResponse } from '#shared/types/catalog';

/**
 * Раздел «Офисы»: список и заведение нового.
 *
 * Правка, архив, состав сотрудников и остатки живут на странице офиса: список отвечает
 * на вопрос «какие офисы есть», а не на все вопросы сразу.
 */

definePageMeta({
  // Менеджеру этот раздел не открыт. Решают ручки, а не эта строка: она лишь уводит
  // на его работу вместо череды отказов (`app/middleware/catalog-access.ts`).
  middleware: 'catalog-access',
});

useHead({ title: 'Офисы — XalqBonus' });

const { data, status, refresh } = await useFetch<OfficeListResponse>('/api/offices');

const state = computed(() => toLoadState(status.value));

const saving = ref(false);
const saveError = ref<string | null>(null);

/**
 * Заведение офиса. Список перечитывается после ответа, а не дополняется на клиенте:
 * порядок в нём задаёт сервер — архивные последними, — и вставлять строку по своему
 * представлению о порядке значило бы однажды показать её не там.
 */
const create = async (body: OfficeRequestBody): Promise<void> => {
  saving.value = true;
  saveError.value = null;

  try {
    const created = await $fetch<OfficeResponse>('/api/offices', { method: 'POST', body });

    await refresh();
    await navigateTo(`/offices/${created.office.officeId}`);
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
      <h1 class="text-xl font-semibold text-slate-900">Офисы</h1>
      <p class="mt-1 text-sm text-slate-500">
        Где выдают заказы. Остаток товара живёт по офисам: центрального склада нет, приход
        оформляется сразу в офис.
      </p>
    </div>

    <OrganismsOfficeTable :state="state" :data="data ?? null" />

    <OrganismsOfficeForm
      title="Новый офис"
      submit-label="Завести офис"
      :office="null"
      :saving="saving"
      :error="saveError"
      @submit="create"
    />
  </div>
</template>
