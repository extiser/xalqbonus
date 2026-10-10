<script setup lang="ts">
/**
 * Номер телефона, введённый руками, — заявка кандидата на Telegram, где окна «Поделиться номером»
 * нет (`_reference/design/application/01-form.html#old`). Код страны стоит перед полем и не вводится:
 * в поле — девять цифр, пробелы и дефисы допустимы.
 *
 * Плашка — та же, что у «Имени» (`MemberSurveyField`, вид `line`): поля стоят стопкой одного вида.
 */
defineProps<{
  label: string;
}>();

const phone = defineModel<string>({ required: true });

/** Девять цифр с двумя пробелами и двумя дефисами: «90 123-45-67». */
const MAX_LENGTH = 12;
</script>

<template>
  <label
    class="flex flex-col gap-1.5 rounded-[16px] border border-white/8 bg-xb-button-grey px-4 py-3 transition-[background-color,border-color] duration-150 focus-within:border-xb-garnet focus-within:bg-[rgba(232,54,93,0.10)]"
  >
    <span class="text-[12px] font-semibold tracking-[0.3px] text-xb-grey">{{ label }}</span>
    <span class="flex items-center gap-1.5">
      <span class="text-[16px] font-medium text-xb-grey">+998</span>
      <input
        v-model="phone"
        type="tel"
        inputmode="tel"
        autocomplete="tel-national"
        :maxlength="MAX_LENGTH"
        placeholder="90 123-45-67"
        class="h-6 w-full border-0 bg-transparent p-0 font-manrope text-[16px] font-medium text-xb-text outline-none placeholder:font-normal placeholder:text-xb-muted"
      />
    </span>
  </label>
</template>
