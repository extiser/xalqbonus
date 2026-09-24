<script setup lang="ts">
import type { MemberLanguage } from '~/types/memberView';

/**
 * Переключатель языка UZ / RU в шапке экранов регистрации после шага 1.
 *
 * Редкое действие, поэтому наверху и компактно: основное действие экрана остаётся внизу.
 * Подписи — коды языков, одинаковые на обоих языках, поэтому живут здесь, а не приходят
 * текстами. Пока проверяется номер, переключатель гаснет (`disabled`) и не нажимается:
 * язык уже уехал в запросе.
 */
const language = defineModel<MemberLanguage>({ required: true });

defineProps<{ disabled?: boolean }>();

const OPTIONS: { language: MemberLanguage; label: string }[] = [
  { language: 'uz', label: 'UZ' },
  { language: 'ru', label: 'RU' },
];
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Til / Язык"
    class="flex gap-0.5 rounded-full border border-white/9 bg-[rgba(20,23,29,0.72)] p-[3px] backdrop-blur-[10px] transition-opacity duration-200"
    :class="disabled ? 'opacity-45' : ''"
  >
    <button
      v-for="option in OPTIONS"
      :key="option.language"
      type="button"
      role="radio"
      :aria-checked="language === option.language"
      :disabled="disabled"
      class="h-[30px] min-w-[42px] cursor-pointer rounded-full border-0 px-2.5 font-manrope text-[13px] font-semibold tracking-[0.4px] disabled:cursor-default"
      :class="language === option.language ? 'bg-xb-text text-xb-screen' : 'bg-transparent text-xb-light'"
      @click="language = option.language"
    >
      {{ option.label }}
    </button>
  </div>
</template>
