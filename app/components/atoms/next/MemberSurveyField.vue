<script setup lang="ts">
import { onMounted, ref } from 'vue';

/**
 * Поле ответа своими словами в опросе — до 300 знаков, со счётчиком.
 *
 * `own` — «Свой вариант» у вопроса с выбором (`_reference/design/survey/question-single-own.html`):
 * появляется на месте строки «Свой вариант», сразу в фокусе и с гранатовым контуром, подпись
 * сверху. `text` — свободный ответ (`question-text.html`): серое в покое, гранатовый контур
 * в фокусе, выше ростом.
 *
 * `line` — однострочное поле с подписью внутри плашки, без счётчика: «Имя» в заявке кандидата
 * (`_reference/design/application/01-form.html`, `.field`). Плашка та же, что у `text`, — макет
 * заявки взял её с поля опроса; предел длины задаёт экран.
 */
type FieldVariant = 'own' | 'text' | 'line';

const props = defineProps<{
  variant: FieldVariant;
  placeholder: string;
  /** Подпись над полем — у `own` и `line`. */
  label?: string;
  /** Предел знаков у `line`. */
  maxlength?: number;
  /** Подсказка браузеру для автозаполнения у `line`. */
  autocomplete?: string;
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
    v-if="variant === 'line'"
    class="flex flex-col gap-1.5 rounded-[16px] border border-white/8 bg-xb-button-grey px-4 py-3 transition-[background-color,border-color] duration-150 focus-within:border-xb-garnet focus-within:bg-[rgba(232,54,93,0.10)]"
  >
    <span class="text-[12px] font-semibold tracking-[0.3px] text-xb-grey">{{ label }}</span>
    <input
      v-model="text"
      type="text"
      :maxlength="maxlength"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      class="h-6 w-full border-0 bg-transparent p-0 font-manrope text-[16px] font-medium text-xb-text outline-none placeholder:font-normal placeholder:text-xb-muted"
    />
  </label>
  <label
    v-else
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
