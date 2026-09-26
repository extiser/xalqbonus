<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatNumber } from '~/utils/format';
import type { OfficeStockRow } from '#shared/types/catalog';

/**
 * Строка таблицы остатков: два числа и два действия над ними.
 *
 * Состояние живёт в строке, потому что оно и есть состояние строки: какая форма раскрыта
 * и что в неё набрано. Держать это в таблице значило бы карту «идентификатор товара →
 * набранное» на каждое поле, и первая же сортировка таблицы её перепутала бы.
 *
 * За данными компонент не ходит и остаток сам не правит: числа приходят свойством, нажатия
 * уходят наверх событиями (docs/frontend.md → «Данные в компоненты не ходят»).
 */
const props = defineProps<{
  row: OfficeStockRow;
  /** Операция по этой строке в пути: обе формы на время гаснут. */
  busy: boolean;
  /** Действий нет: ДЕМО ОФИС у того, кто его не правит (issue #212). */
  readonly?: boolean;
}>();

const emit = defineEmits<{
  receive: [payload: { quantity: number; note: string }];
  adjust: [payload: { onHand: number; note: string }];
}>();

/** Какая форма раскрыта. Одна за раз: две открытые формы на одной строке спорили бы за число. */
const openForm = ref<'receive' | 'adjust' | null>(null);

const receiveQuantity = ref('');
const receiveNote = ref('');
const adjustOnHand = ref('');
const adjustNote = ref('');

/**
 * Открытие формы правки подставляет текущий остаток: сотрудник пересчитал полку и правит
 * число, а не набирает его с нуля. Приход начинается с пустого поля — количество из накладной
 * с остатком не связано ничем.
 */
const toggle = (form: 'receive' | 'adjust'): void => {
  openForm.value = openForm.value === form ? null : form;

  if (openForm.value === 'receive') {
    receiveQuantity.value = '';
    receiveNote.value = '';
  }

  if (openForm.value === 'adjust') {
    adjustOnHand.value = String(props.row.onHand);
    adjustNote.value = '';
  }
};

// Ответ сервера меняет остаток — форма закрывается сама: оставленная открытой, она показывала
// бы прежнее число рядом с новым.
watch(
  () => props.row.onHand,
  () => {
    openForm.value = null;
  },
);

const submitReceive = (): void => {
  emit('receive', { quantity: Number(receiveQuantity.value), note: receiveNote.value.trim() });
};

const submitAdjust = (): void => {
  emit('adjust', { onHand: Number(adjustOnHand.value), note: adjustNote.value.trim() });
};

const archived = computed(() => props.row.archivedAt !== null);
</script>

<template>
  <div class="border-t border-slate-200 py-3 first:border-t-0">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div class="min-w-40 flex-1">
        <p class="text-sm font-medium text-slate-900">{{ row.name }}</p>
        <p class="mt-0.5 text-xs text-slate-500">
          {{ row.pricePoints === null ? 'без цены в баллах' : `${formatNumber(row.pricePoints)} баллов` }}
        </p>
      </div>

      <AtomsStatusBadge v-if="row.promo" tone="ok" label="Для акции" />
      <AtomsStatusBadge v-if="row.hiddenInCatalog" tone="muted" label="Не на витрине" />
      <AtomsStatusBadge v-if="archived" tone="muted" label="В архиве" />

      <div class="w-20 text-right">
        <p class="text-xs text-slate-500">свободно</p>
        <p class="text-sm font-semibold text-slate-900">{{ formatNumber(row.onHand) }}</p>
      </div>

      <div class="w-20 text-right">
        <p class="text-xs text-slate-500">в резерве</p>
        <p class="text-sm text-slate-700">{{ formatNumber(row.reserved) }}</p>
      </div>

      <div v-if="!readonly" class="flex gap-2">
        <AtomsActionButton label="Приход" :disabled="busy" @click="toggle('receive')" />
        <AtomsActionButton label="Поправить" :disabled="busy" @click="toggle('adjust')" />
      </div>
    </div>

    <form
      v-if="openForm === 'receive'"
      class="mt-3 flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3"
      @submit.prevent="submitReceive"
    >
      <div class="w-28">
        <MoleculesNumberField
          v-model="receiveQuantity"
          label="Сколько пришло"
          :min="1"
          required
        />
      </div>
      <div class="min-w-48 flex-1">
        <MoleculesFormField
          v-model="receiveNote"
          label="Заметка"
          type="text"
          placeholder="накладная, поставщик"
          hint="Необязательно: накладная говорит сама."
        />
      </div>
      <AtomsSubmitButton label="Оформить приход" :disabled="busy" />
    </form>

    <form
      v-if="openForm === 'adjust'"
      class="mt-3 flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3"
      @submit.prevent="submitAdjust"
    >
      <div class="w-28">
        <MoleculesNumberField
          v-model="adjustOnHand"
          label="Стало"
          :min="0"
          required
        />
      </div>
      <div class="min-w-48 flex-1">
        <!-- Заметка помечена `required`: пустую форму останавливает браузер рядом с полем,
             и до сервера она не доходит вовсе (docs/frontend.md → «Обязательное поле —
             свойство поля»). Сервер требует её независимо: правка приходит не только отсюда. -->
        <MoleculesFormField
          v-model="adjustNote"
          label="Почему"
          type="text"
          placeholder="пересчёт остатков, бой, недостача"
          required
          hint="Обязательно: без объяснения правку через месяц не отличить от ошибки."
        />
      </div>
      <AtomsSubmitButton label="Поправить остаток" :disabled="busy" />
    </form>
  </div>
</template>
