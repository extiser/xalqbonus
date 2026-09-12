<script setup lang="ts">
/**
 * Кнопка отправки формы. Своего отступа и своей ширины снаружи не получает — и то,
 * и другое ставит контейнер.
 *
 * Недоступная кнопка гасится видом, а не одним атрибутом: нажатие, которое ничего
 * не делает и никак не выглядит, человек повторяет — и на медленной сети отправляет
 * форму дважды.
 */
type ButtonSize = 'medium' | 'large';

withDefaults(
  defineProps<{
    label: string;
    size?: ButtonSize;
    disabled?: boolean;
  }>(),
  { size: 'medium', disabled: false },
);

const SIZE_CLASSES: Record<ButtonSize, string> = {
  medium: 'px-4 py-1.5 text-sm',
  large: 'px-5 py-2.5 text-base',
};
</script>

<template>
  <button
    type="submit"
    :disabled="disabled"
    class="rounded-md bg-slate-900 font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:hover:bg-slate-400"
    :class="SIZE_CLASSES[size]"
  >
    {{ label }}
  </button>
</template>
