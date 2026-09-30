<script setup lang="ts">
import type { SelectOption } from '~/types/selectOption';

/**
 * Поле формы с выпадающим списком: подпись и выбор (issue #310).
 *
 * Разметка и размер — те же, что у `MoleculesFormField`: подпись сверху тем же шрифтом и тем же
 * отступом, поле крупное. В одном ряду с полями ввода подписи стоят на одном уровне, а поля
 * одной высоты — без подгонки на месте вызова.
 *
 * Вариант-заглушка («Все офисы») приходит содержимым, как у `AtomsSelectInput`.
 */
withDefaults(
  defineProps<{
    label: string;
    options: SelectOption[];
    required?: boolean;
    disabled?: boolean;
  }>(),
  { required: false, disabled: false },
);

const model = defineModel<string>({ required: true });
</script>

<template>
  <label class="block">
    <span class="mb-1 block text-sm font-medium text-slate-700">{{ label }}</span>
    <AtomsSelectInput
      v-model="model"
      :options="options"
      size="large"
      :required="required"
      :disabled="disabled"
    >
      <slot />
    </AtomsSelectInput>
  </label>
</template>
