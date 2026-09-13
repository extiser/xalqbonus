<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { failureText } from '~/utils/requestError';
import { toLoadState } from '~/utils/loadState';
import type {
  OfficeCardResponse,
  OfficeEmployeesResponse,
  OfficeRequestBody,
  OfficeResponse,
  OfficeStockResponse,
  StockMovementsResponse,
  StockOperationResponse,
} from '#shared/types/catalog';
import type { EmployeeAccountsResponse } from '#shared/types/employee';

/**
 * Страница офиса: правка, архив, состав сотрудников, остатки и журнал движений.
 *
 * Запросов четыре, а не один: у блоков разная цена и разное листание, и валить их в одну
 * ручку значило бы перечитывать состав офиса при каждом перелистывании журнала.
 *
 * Данные берутся здесь, а не в компонентах: компонент принимает готовое свойством и о ручках
 * не знает (docs/frontend.md → «Данные в компоненты не ходят»).
 */

definePageMeta({
  middleware: 'catalog-access',
});

const route = useRoute();
const officeId = computed(() => String(route.params.officeId));

const MOVEMENTS_LIMIT = 25;
const movementsOffset = ref(0);

const { data: card, status: cardStatus, refresh: refreshCard } = await useFetch<OfficeCardResponse>(
  () => `/api/offices/${officeId.value}`,
);
const { data: stock, status: stockStatus, refresh: refreshStock } =
  await useFetch<OfficeStockResponse>(() => `/api/offices/${officeId.value}/stock`);
const { data: movements, status: movementsStatus, refresh: refreshMovements } =
  await useFetch<StockMovementsResponse>(() => `/api/offices/${officeId.value}/stock-movements`, {
    query: { limit: MOVEMENTS_LIMIT, offset: movementsOffset },
  });
const { data: accounts, status: accountsStatus } =
  await useFetch<EmployeeAccountsResponse>('/api/employees');

useHead({ title: () => `${card.value?.office.name ?? 'Офис'} — XalqBonus` });

const cardState = computed(() => toLoadState(cardStatus.value));
const stockState = computed(() => toLoadState(stockStatus.value));
const movementsState = computed(() => toLoadState(movementsStatus.value));
const accountsState = computed(() => toLoadState(accountsStatus.value));

const archived = computed(() => card.value?.office.archivedAt !== null);

const savingOffice = ref(false);
const officeError = ref<string | null>(null);

const save = async (body: OfficeRequestBody): Promise<void> => {
  savingOffice.value = true;
  officeError.value = null;

  try {
    await $fetch<OfficeResponse>(`/api/offices/${officeId.value}`, { method: 'PATCH', body });
    await refreshCard();
  } catch (error) {
    officeError.value = failureText(error);
  } finally {
    savingOffice.value = false;
  }
};

/** Закрытие и возврат — одна кнопка на два адреса: состояние офиса решает, какой из них. */
const toggleArchive = async (): Promise<void> => {
  savingOffice.value = true;
  officeError.value = null;

  try {
    await $fetch<OfficeResponse>(
      `/api/offices/${officeId.value}/${archived.value ? 'unarchive' : 'archive'}`,
      { method: 'POST' },
    );
    await refreshCard();
  } catch (error) {
    officeError.value = failureText(error);
  } finally {
    savingOffice.value = false;
  }
};

const savingEmployees = ref(false);
const employeesError = ref<string | null>(null);

const saveEmployees = async (employeeIds: string[]): Promise<void> => {
  savingEmployees.value = true;
  employeesError.value = null;

  try {
    await $fetch<OfficeEmployeesResponse>(`/api/offices/${officeId.value}/employees`, {
      method: 'PUT',
      body: { employeeIds },
    });
    await refreshCard();
  } catch (error) {
    employeesError.value = failureText(error);
  } finally {
    savingEmployees.value = false;
  }
};

/** По какой строке остатков идёт операция: обе её формы на это время гаснут. */
const busyProductId = ref<string | null>(null);
const stockError = ref<string | null>(null);

/**
 * Приход и правка отличаются адресом и телом, а всё остальное у них одно: погасить строку,
 * позвать ручку, перечитать таблицу и журнал. Поэтому — один путь на две операции: два
 * почти одинаковых обработчика разошлись бы на первой же правке обработки отказа.
 *
 * Перечитываются оба блока: таблица показывает кэш остатка, журнал — его истину, и обновить
 * один без другого значит показать расхождение там, где его нет.
 */
const runStockOperation = async (
  productId: string,
  action: 'receive' | 'adjust',
  body: Record<string, number | string>,
): Promise<void> => {
  busyProductId.value = productId;
  stockError.value = null;

  try {
    await $fetch<StockOperationResponse>(
      `/api/offices/${officeId.value}/stock/${productId}/${action}`,
      { method: 'POST', body },
    );
    await Promise.all([refreshStock(), refreshMovements()]);
  } catch (error) {
    stockError.value = failureText(error);
  } finally {
    busyProductId.value = null;
  }
};

const receive = (payload: { productId: string; quantity: number; note: string }): Promise<void> =>
  runStockOperation(payload.productId, 'receive', {
    quantity: payload.quantity,
    note: payload.note,
  });

const adjust = (payload: { productId: string; onHand: number; note: string }): Promise<void> =>
  runStockOperation(payload.productId, 'adjust', { onHand: payload.onHand, note: payload.note });
</script>

<template>
  <div class="space-y-6">
    <div>
      <NuxtLink to="/offices" class="text-sm text-slate-500 underline underline-offset-2">
        ← Все офисы
      </NuxtLink>
      <h1 class="mt-2 text-xl font-semibold text-slate-900">
        {{ card?.office.name ?? 'Офис' }}
      </h1>
      <p v-if="card?.office.archivedAt" class="mt-1 text-sm text-slate-500">
        Офис в архиве: заказов не принимает, но остаётся в истории и в остатках.
      </p>
    </div>

    <MoleculesStateNotice
      v-if="cardState === 'loading'"
      state="loading"
      message="Читаем офис…"
    />
    <MoleculesStateNotice
      v-else-if="cardState === 'error'"
      state="error"
      message="Офис не прочитался. Это отказ запроса, а не отсутствие офиса."
    />
    <template v-else-if="card">
      <OrganismsOfficeForm
        title="Правка офиса"
        submit-label="Сохранить"
        :office="card.office"
        :saving="savingOffice"
        :error="officeError"
        @submit="save"
      />

      <MoleculesSectionPanel
        title="Архив"
        note="Удаления нет: на офис ссылаются заказы, и заказ обязан помнить, где его выдавали."
      >
        <AtomsActionButton
          :label="archived ? 'Вернуть из архива' : 'Убрать в архив'"
          :tone="archived ? 'primary' : 'danger'"
          :disabled="savingOffice"
          @click="toggleArchive"
        />
      </MoleculesSectionPanel>

      <OrganismsOfficeEmployees
        :employees="card.employees"
        :accounts="accounts?.employees ?? null"
        :accounts-state="accountsState"
        :saving="savingEmployees"
        :error="employeesError"
        @save="saveEmployees"
      />

      <OrganismsOfficeStockTable
        :state="stockState"
        :data="stock ?? null"
        :busy-product-id="busyProductId"
        :error="stockError"
        @receive="receive"
        @adjust="adjust"
      />

      <OrganismsStockMovementJournal
        :state="movementsState"
        :data="movements ?? null"
        @page="movementsOffset = $event"
      />
    </template>
  </div>
</template>
