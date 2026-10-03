<script setup lang="ts">
import { onMounted, ref } from 'vue';

/**
 * Поле ответа своими словами в опросе — до 300 знаков, со счётчиком.
 *
 * `own` — «Свой вариант» у вопроса с выбором (`_reference/design/survey/question-single-own.html`):
 * появляется на месте строки «Свой вариант», сразу в фокусе и с гранатовым контуром, подпись
 * сверху. `text` — свободный ответ (`question-text.html`): серое в покое, гранатовый контур
 * в фокусе, выше ростом.
 */
type FieldVariant = 'own' | 'text';

const props = defineProps<{
  variant: FieldVariant;
  placeholder: string;
  /** Подпись над полем — только у `own`. */
  label?: string;
}>();

const text = defineModel<string>({ required: true });

/** Предел — тот же, что проверка в миграции `survey_answers`. */
const LIMIT = 300;

const field = ref<HTMLTextAreaElement | null>(null);

// «Свой вариант» открывается нажатием, и клавиатура поднимается сразу.
onMounted(() => {
  if (props.variant === 'own') {
    field.value?.focus();
  }
});
</script>

<template>
  <label
    class="flex flex-col gap-2 rounded-[16px] border transition-[background-color,border-color] duration-150"
    :class="
      variant === 'own'
        ? 'border-xb-garnet bg-[rgba(232,54,93,0.10)] px-3.5 pt-3 pb-2.5'
        : 'border-white/8 bg-xb-button-grey px-4 pt-3.5 pb-2.5 focus-within:border-xb-garnet focus-within:bg-[rgba(232,54,93,0.10)]'
    "
  >
    <span v-if="variant === 'own' && label" class="text-[12px] font-semibold tracking-[0.4px] text-xb-garnet">{{ label }}</span>
    <textarea
      ref="field"
      v-model="text"
      :rows="variant === 'own' ? 2 : 4"
      :maxlength="LIMIT"
      :placeholder="placeholder"
      class="resize-none border-0 bg-transparent p-0 font-manrope text-[15px] leading-[1.45] font-normal text-xb-text outline-none placeholder:text-xb-muted"
      :class="variant === 'own' ? 'min-h-11' : 'min-h-[88px]'"
    />
    <span class="self-end text-[11px] font-normal text-xb-muted">{{ text.length }} / {{ LIMIT }}</span>
  </label>
</template>
