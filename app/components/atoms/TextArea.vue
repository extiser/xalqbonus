<script setup lang="ts">
/**
 * Многострочный ввод: описание товара, заметка к правке остатка, текст рассылки.
 *
 * Высота задана строками, а не пикселями: поле должно вмещать ту мысль, ради которой
 * оно многострочное, и растягиваться дальше — работа браузера, а не наша.
 *
 * Перебор показывается смысловым `invalid`, а не классом снаружи: красная рамка — вид поля,
 * и принадлежит она полю (docs/frontend.md → «Компонент владеет своим визуалом»).
 */
const props = withDefaults(
  defineProps<{
    rows?: number;
    placeholder?: string;
    ariaLabel?: string;
    required?: boolean;
    /** Жёсткий предел длины — свойство поля: дальше браузер набирать не даст. */
    maxlength?: number;
    /** Значение не годится для дела, ради которого поле: рамка подсвечивается. */
    invalid?: boolean;
  }>(),
  {
    rows: 3,
    placeholder: undefined,
    ariaLabel: undefined,
    required: false,
    maxlength: undefined,
    invalid: false,
  },
);

const model = defineModel<string>({ required: true });
</script>

<template>
  <textarea
    v-model="model"
    :rows="props.rows"
    :placeholder="props.placeholder"
    :aria-label="props.ariaLabel"
    :aria-invalid="props.invalid || undefined"
    :required="props.required"
    :maxlength="props.maxlength"
    class="w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2"
    :class="
      props.invalid
        ? 'border-red-400 focus-visible:border-red-500 focus-visible:outline-red-300'
        : 'border-slate-300 focus-visible:border-slate-400 focus-visible:outline-slate-400'
    "
  />
</template>
