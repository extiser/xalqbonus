<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ManualPointsField } from '#shared/types/driver';

/**
 * Ручная правка баллов водителю: сумма со знаком, заметка, кнопка.
 *
 * Знак суммы — направление: плюс начисляет с эмиссии, минус списывает обратно. Отдельной
 * пары кнопок «начислить» и «списать» нет — у операции одна форма и один ключ `manual`.
 *
 * За данными компонент не ходит: набранное уходит наверх событием, отказ приходит свойством
 * вместе с полем, к которому он относится (docs/frontend.md → «Данные в компоненты не ходят»).
 */
const props = defineProps<{
  /** Запрос в пути: кнопка гаснет, и двойное нажатие второй правки не заводит. */
  saving: boolean;
  /** Отказ последнего запроса. `null` — показывать нечего. */
  error: string | null;
  /** К какому полю относится отказ. `null` — к форме целиком. */
  errorField: ManualPointsField | null;
  /** Растёт с каждой успешной правкой: форма очищается, чтобы её нельзя было отправить повторно. */
  appliedCount: number;
}>();

const emit = defineEmits<{
  submit: [payload: { amount: number; note: string }];
}>();

const amount = ref('');
const note = ref('');

watch(
  () => props.appliedCount,
  () => {
    amount.value = '';
    note.value = '';
  },
);

const submit = (): void => {
  emit('submit', { amount: Number(amount.value), note: note.value.trim() });
};
</script>

<template>
  <MoleculesSectionPanel
    title="Ручная правка баллов"
    note="Корректировка баланса — исправление ошибки, в том числе в минус. Подарок по поводу выдаётся наградой ниже: она попадёт водителю в раздел наград. Плюс начисляет с эмиссии, минус списывает обратно; в истории правка встанет с причиной «ручная правка», заметкой и вашим именем."
  >
    <!-- Сумма и заметка помечены `required`, а поле суммы — целым шагом: пустое и дробное
         останавливает браузер рядом с полем (docs/frontend.md → «Обязательное поле —
         свойство поля»). Сервер проверяет то же заново: ручка приходит не только отсюда. -->
    <form class="flex flex-wrap items-start gap-3" @submit.prevent="submit">
      <div class="w-40">
        <MoleculesNumberField
          v-model="amount"
          label="Сумма"
          :min="null"
          placeholder="+100 или −50"
          required
          :error="errorField === 'amount' ? error : null"
        />
      </div>
      <div class="min-w-56 flex-1">
        <MoleculesFormField
          v-model="note"
          label="Почему"
          type="text"
          placeholder="компенсация, списание мимо каталога"
          required
          :error="errorField === 'note' ? error : null"
          hint="Обязательно: без объяснения правку через месяц не отличить от ошибки."
        />
      </div>
      <div class="pt-6">
        <AtomsSubmitButton :label="saving ? 'Записываем…' : 'Записать'" :disabled="saving" />
      </div>
    </form>
    <p v-if="error && errorField === null" class="mt-3 text-sm text-red-700">{{ error }}</p>
  </MoleculesSectionPanel>
</template>
