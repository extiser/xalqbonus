<script setup lang="ts">
/**
 * Кнопка действия — не отправки формы.
 *
 * Отдельно от `SubmitButton` намеренно: та живёт в форме и нажимается браузером по Enter,
 * а эта открывает форму, закрывает офис, снимает сотрудника, и `type="button"` у неё
 * не подробность — внутри формы кнопка без него отправляет форму.
 *
 * Вид приходит смысловым свойством `tone`, а не классом снаружи: `primary` — главное
 * действие блока, `secondary` — рядовое, `danger` — то, что меняет состояние в сторону,
 * из которой возвращаются отдельным действием (архив).
 */
type ButtonTone = 'primary' | 'secondary' | 'danger';

withDefaults(
  defineProps<{
    label: string;
    tone?: ButtonTone;
    disabled?: boolean;
  }>(),
  { tone: 'secondary', disabled: false },
);

const emit = defineEmits<{ click: [] }>();

/**
 * Недоступная кнопка гасится видом, а не одним атрибутом: нажатие, которое ничего не делает
 * и никак не выглядит, человек повторяет.
 */
const TONE_CLASSES: Record<ButtonTone, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-400',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900 disabled:text-slate-400',
  danger:
    'border border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50 disabled:text-red-300',
};
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    class="rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed"
    :class="TONE_CLASSES[tone]"
    @click="emit('click')"
  >
    {{ label }}
  </button>
</template>
