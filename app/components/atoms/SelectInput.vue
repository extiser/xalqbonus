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
 */
withDefaults(
  defineProps<{
    options: SelectOption[];
    /** Подпись для тех, кто не видит поля. Не нужна там, где поле обёрнуто в `<label>`. */
    ariaLabel?: string;
    required?: boolean;
  }>(),
  { ariaLabel: undefined, required: false },
);

const model = defineModel<string>({ required: true });
</script>

<template>
  <select
    v-model="model"
    :aria-label="ariaLabel"
    :required="required"
    class="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 transition-colors focus-visible:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
  >
    <slot />
    <option v-for="option in options" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
</template>
