<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { PhMagnifyingGlass } from '@phosphor-icons/vue';

/**
 * Поиск в шапке плитки — кодекс веба, «Поиск в шапке плитки» (issue #471): высота 40,
 * скругление 14, поднятая поверхность, значок `magnifying-glass` 18 серым, текст 14 / 400,
 * подсказка цветом оси. Ширина от 260; ниже 900 — на всю ширину.
 *
 * Запрос уходит наверх через 300 мс после последней буквы: таблица не перезапрашивается
 * на каждое нажатие. Значение снаружи — например, из адреса — поле принимает, не отправляя
 * его обратно.
 */
const props = defineProps<{
  modelValue: string;
  placeholder: string;
  label: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const DEBOUNCE_MS = 300;

const text = ref(props.modelValue);
let timer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.modelValue,
  (value) => {
    if (value !== text.value) text.value = value;
  },
);

const onInput = (event: Event): void => {
  if (!(event.target instanceof HTMLInputElement)) return;

  text.value = event.target.value;

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => emit('update:modelValue', text.value), DEBOUNCE_MS);
};

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <label
    class="flex h-10 min-w-[260px] items-center gap-2.5 rounded-[14px] bg-web-raised px-3.5 focus-within:inset-ring-[1.5px] focus-within:inset-ring-web-cyan max-web:w-full max-web:min-w-0"
  >
    <PhMagnifyingGlass weight="duotone" aria-hidden="true" class="size-[18px] shrink-0 text-web-grey" />
    <input
      type="search"
      :value="text"
      :placeholder="placeholder"
      :aria-label="label"
      class="min-w-0 flex-1 border-0 bg-transparent font-manrope text-[14px] font-normal text-web-text outline-none placeholder:text-web-axis"
      @input="onInput"
    />
  </label>
</template>
