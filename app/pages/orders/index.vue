<script setup lang="ts">
import { computed, ref } from 'vue';
import { useOfficeDesk } from '~/composables/useOfficeDesk';
import { toLoadState } from '~/utils/loadState';
import { failureCode } from '~/utils/requestError';
import type { SelectOption } from '~/types/selectOption';
import type { OfficeOrdersResponse } from '#shared/types/orders';

/**
 * Раздел «Заказы»: заказы офиса, выдача по коду и отмена — для всех ролей. Поле кода одно
 * на заказы и награды (issue #172): найденная награда открывается своей карточкой.
 *
 * Те же ручки и те же действия, что у стойки в Mini App: здесь за столом, под cookie
 * (docs/decisions.md → «Доступ определяется ролью, а не дверью»). Менеджеру в выборе офиса
 * приходят только его офисы — список составляет сервер.
 */

useHead({ title: 'Заказы — XalqBonus' });

const ORDERS_LIMIT = 25;

/** Выбранный офис. Пусто — сервер берёт первый работающий из офисов сотрудника. */
const selectedOfficeId = ref('');
const selectedStatus = ref('');
const offset = ref(0);

const desk = useOfficeDesk(() => ({}));
const code = ref('');

const {
  data,
  status: fetchStatus,
  error,
  refresh,
} = await useFetch<OfficeOrdersResponse>('/api/orders', {
  query: { officeId: selectedOfficeId, status: selectedStatus, limit: ORDERS_LIMIT, offset },
});

const state = computed(() => toLoadState(fetchStatus.value));

/**
 * Менеджер без офисов. Ручка отвечает ему `office_not_open` (issue #250), и другой причины
 * отказать списку у вошедшего сотрудника нет: выбор офиса предлагает только открытые ему офисы.
 */
const withoutOffices = computed(() => failureCode(error.value) === 'office_not_open');

const officeId = computed({
  get: () => selectedOfficeId.value || data.value?.officeId || '',
  set: (value: string) => {
    selectedOfficeId.value = value;
    offset.value = 0;
    desk.reset();
  },
});

const statusFilter = computed({
  get: () => selectedStatus.value,
  set: (value: string) => {
    selectedStatus.value = value;
    offset.value = 0;
  },
});

const officeOptions = computed<SelectOption[]>(() =>
  (data.value?.offices ?? []).map((office) => ({
    value: office.officeId,
    label: office.archived ? `${office.name} (в архиве)` : office.name,
  })),
);

const STATUS_OPTIONS: SelectOption[] = [
  { value: 'pending', label: 'Ждут выдачи' },
  { value: 'issued', label: 'Выданы' },
  { value: 'cancelled', label: 'Отменены' },
];

const search = async (): Promise<void> => {
  if (officeId.value === '') {
    return;
  }

  await desk.findByCode(officeId.value, code.value);
};

/**
 * Выдача и отмена. Таблица перечитывается после любого исхода: при отказе «уже выдан»
 * строка в ней тоже устарела.
 */
const issue = async (): Promise<void> => {
  if (await desk.issue()) {
    code.value = '';
  }

  await refresh();
};

const cancel = async (): Promise<void> => {
  if (await desk.cancel()) {
    code.value = '';
  }

  await refresh();
};
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-slate-900">Заказы</h1>
      <p class="mt-1 text-sm text-slate-500">
        Выдача и отмена заказов водителей. Баллы списаны при оформлении: выдача их не трогает,
        отмена возвращает целиком.
      </p>
    </div>

    <MoleculesStateNotice
      v-if="withoutOffices"
      state="empty"
      message="Вас не привязали к офису. Обратитесь к руководителю."
    />

    <template v-else>
      <div class="flex flex-wrap gap-3">
        <div class="w-64">
          <AtomsSelectInput v-model="officeId" :options="officeOptions" aria-label="Офис" />
        </div>
        <div class="w-48">
          <AtomsSelectInput v-model="statusFilter" :options="STATUS_OPTIONS" aria-label="Статус">
            <option value="">Все статусы</option>
          </AtomsSelectInput>
        </div>
      </div>

      <MoleculesOrderCodeForm
        v-model="code"
        :searching="desk.searching.value"
        :error="desk.searchError.value"
        :notice="desk.notice.value"
        @submit="search"
      />

      <OrganismsOfficeOrderCard
        v-if="desk.current.value?.kind === 'order'"
        :order="desk.current.value.order"
        :acting="desk.acting.value"
        :error="desk.actionError.value"
        @issue="issue"
        @cancel="cancel"
        @close="desk.close()"
      />

      <OrganismsOfficeRewardCard
        v-else-if="desk.current.value?.kind === 'reward'"
        :reward="desk.current.value.reward"
        :acting="desk.acting.value"
        :error="desk.actionError.value"
        @issue="issue"
        @close="desk.close()"
      />

      <OrganismsOfficeOrderTable
        :state="state"
        :data="data ?? null"
        @open="desk.open({ kind: 'order', order: $event })"
        @page="offset = $event"
      />
    </template>
  </div>
</template>
