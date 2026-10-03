<script setup lang="ts">
/**
 * Вариант ответа в опросе — `_reference/design/survey/question-single-own.html`, `question-multiple.html`.
 *
 * Отдельный элемент, а не вид `MemberButton` (сверка 03-10-2026, `survey.md`): цвета вторичной L,
 * текст слева, отметка справа. Выбранный — гранатовый контур и заливка 14 %.
 *
 * Отметка по форме говорит, сколько можно выбрать: `radio` — кружок, один ответ; `check` —
 * квадрат с галочкой, несколько. `own` — строка «Свой вариант» со значком карандаша: нажатие
 * превращает её в поле, и выбранной она не бывает.
 */
type ChoiceMark = 'radio' | 'check' | 'own';

defineProps<{
  text: string;
  mark: ChoiceMark;
  selected?: boolean;
}>();

defineEmits<{ select: [] }>();
</script>

<template>
  <button
    type="button"
    class="relative z-[1] box-border flex min-h-[52px] w-full cursor-pointer items-center justify-between gap-3 rounded-[16px] border px-4 py-3.5 text-left font-manrope text-[15px] font-semibold text-xb-text transition-[background-color,border-color] duration-150"
    :class="selected ? 'border-xb-garnet bg-[rgba(232,54,93,0.14)]' : 'border-white/8 bg-xb-button-grey active:bg-[#2A2E35]'"
    :role="mark === 'own' ? undefined : mark === 'radio' ? 'radio' : 'checkbox'"
    :aria-checked="mark === 'own' ? undefined : Boolean(selected)"
    @click="$emit('select')"
  >
    <span>{{ text }}</span>
    <span v-if="mark === 'own'" class="flex text-xb-grey">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
      </svg>
    </span>
    <span
      v-else
      class="flex size-5 shrink-0 items-center justify-center border-[1.5px]"
      :class="[
        mark === 'radio' ? 'rounded-full' : 'rounded-[6px]',
        selected ? 'border-xb-garnet bg-xb-garnet' : 'border-white/22',
      ]"
      aria-hidden="true"
    >
      <template v-if="selected">
        <span v-if="mark === 'radio'" class="size-2 rounded-full bg-white" />
        <span v-else class="h-1.5 w-2.5 -translate-y-px -rotate-45 border-b-2 border-l-2 border-white" />
      </template>
    </span>
  </button>
</template>
