<script setup lang="ts">
import { computed, reactive } from 'vue';
import type { SelectOption } from '~/types/selectOption';
import type { DemoGenerateField, DemoGenerateRequestBody, DemoProgramMember } from '#shared/types/demo';

/**
 * Генератор демо-водителей (issue #252): пачка «ДЕМО ВОДИТЕЛЬ N» с разбросом баланса,
 * поездок, давности и участия — под условия демо-сегментов.
 *
 * Границы проверяет ручка и отвечает полем: текст отказа встаёт под своё поле, второй копии
 * правил здесь нет.
 */
const props = defineProps<{
  generating: boolean;
  error: string | null;
  /** Поле, к которому ручка отнесла отказ. */
  errorField: DemoGenerateField | null;
  /** Итог последнего прогона. */
  result: string | null;
}>();

const emit = defineEmits<{ generate: [body: DemoGenerateRequestBody] }>();

const form = reactive({
  count: '10',
  balanceMin: '100',
  balanceMax: '2000',
  tripsMin: '0',
  tripsMax: '10',
  lastTripDaysMin: '3',
  lastTripDaysMax: '30',
  programMember: 'mixed',
});

const MEMBER_OPTIONS: SelectOption[] = [
  { value: 'mixed', label: 'Вперемешку' },
  { value: 'yes', label: 'Все участники' },
  { value: 'no', label: 'Никто не участник' },
];

const programMemberOf = (value: string): DemoProgramMember =>
  value === 'yes' || value === 'no' ? value : 'mixed';

const errorFor = (field: DemoGenerateField): string | null =>
  props.errorField === field ? props.error : null;

/** Отказ не про поле — строкой под формой. */
const generalError = computed(() => (props.errorField === null ? props.error : null));

const submit = (): void => {
  emit('generate', {
    count: Number(form.count),
    balanceMin: Number(form.balanceMin),
    balanceMax: Number(form.balanceMax),
    tripsMin: Number(form.tripsMin),
    tripsMax: Number(form.tripsMax),
    lastTripDaysMin: Number(form.lastTripDaysMin),
    lastTripDaysMax: Number(form.lastTripDaysMax),
    programMember: programMemberOf(form.programMember),
  });
};
</script>

<template>
  <MoleculesSectionPanel
    title="Генератор"
    note="Каждое значение берётся случайно в заданных границах. Участнику пятая поездка приносит ещё 300 — итоговый баланс выше заданного. Telegram у сгенерированных нет."
  >
    <form class="space-y-4" @submit.prevent="submit">
      <div class="grid gap-4 sm:grid-cols-2">
        <MoleculesNumberField
          v-model="form.count"
          label="Сколько водителей"
          :min="1"
          hint="От 1 до 50."
          :error="errorFor('count')"
        />
        <label class="block">
          <span class="mb-1 block text-sm font-medium text-slate-700">Участие в программе</span>
          <AtomsSelectInput v-model="form.programMember" :options="MEMBER_OPTIONS" />
          <span v-if="errorFor('programMember')" class="mt-1 block text-sm text-red-700">
            {{ errorFor('programMember') }}
          </span>
        </label>
        <MoleculesNumberField
          v-model="form.balanceMin"
          label="Баланс от"
          :error="errorFor('balanceMin')"
        />
        <MoleculesNumberField
          v-model="form.balanceMax"
          label="Баланс до"
          :error="errorFor('balanceMax')"
        />
        <MoleculesNumberField
          v-model="form.tripsMin"
          label="Поездок от"
          :error="errorFor('tripsMin')"
        />
        <MoleculesNumberField
          v-model="form.tripsMax"
          label="Поездок до"
          hint="Не больше 30."
          :error="errorFor('tripsMax')"
        />
        <MoleculesNumberField
          v-model="form.lastTripDaysMin"
          label="Последняя поездка, дней назад, от"
          :error="errorFor('lastTripDaysMin')"
        />
        <MoleculesNumberField
          v-model="form.lastTripDaysMax"
          label="Последняя поездка, дней назад, до"
          hint="Без поездок не читается."
          :error="errorFor('lastTripDaysMax')"
        />
      </div>

      <AtomsSubmitButton :label="generating ? 'Заводим…' : 'Сгенерировать'" :disabled="generating" />

      <p v-if="result" class="text-sm text-emerald-700">{{ result }}</p>
      <p v-if="generalError" class="text-sm text-red-700">{{ generalError }}</p>
    </form>
  </MoleculesSectionPanel>
</template>
