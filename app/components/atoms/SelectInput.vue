<script setup lang="ts">
import type { SelectOption } from '~/types/selectOption';

/**
 * Выбор одного значения из списка. Своего отступа и своей ширины снаружи не получает.
 *
 * Варианты приходят свойством: составить список — работа того, кто знает, из чего выбирают,
 * и поле о нём ничего не знает.
 *
 * **Вариант-заглушка («выберите…») сюда не входит.** Он вставляется содержимым — перед
 * остальными, — потому что это текст вызывающего экрана, а не свойство поля: на одном экране
 * это «Выберите учётку», на другом «Все офисы», и свойством такой текст пришлось бы объявить
 * обязательным везде, включая поля, которым пустой выбор не нужен вовсе.
 *
 * Размеры — те же, что у `AtomsTextInput` (issue #310): выпадающий список и поле ввода в одном
 * ряду обязаны быть одной высоты, и держит это атом, а не место вызова.
 */
type SelectSize = 'medium' | 'large';

withDefaults(
  defineProps<{
    options: SelectOption[];
    size?: SelectSize;
    /** Подпись для тех, кто не видит поля. Не нужна там, где поле обёрнуто в `<label>`. */
    ariaLabel?: string;
    required?: boolean;
    /** Выбор здесь не нужен: поле видно, но погашено и не меняется. */
    disabled?: boolean;
  }>(),
  { size: 'medium', ariaLabel: undefined, required: false, disabled: false },
);

const model = defineModel<string>({ required: true });

/** Высота — явная и та же, что у `AtomsTextInput` того же размера: см. там. */
const SIZE_CLASSES: Record<SelectSize, string> = {
  medium: 'h-8.5 px-3 py-1.5 text-sm',
  large: 'h-11.5 px-4 py-2.5 text-base',
};
</script>

<template>
  <select
    v-model="model"
    :aria-label="ariaLabel"
    :required="required"
    :disabled="disabled"
    class="w-full rounded-md border border-slate-300 bg-white text-slate-900 transition-colors focus-visible:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
    :class="SIZE_CLASSES[size]"
  >
    <slot />
    <option v-for="option in options" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
</template>
