<script setup lang="ts">
import { ref } from 'vue';

/**
 * Поле пароля — `_reference/design/staff/06-password.html`, `.flabel`, `.field`, `.hint`, `.err`
 * (issue #250).
 *
 * Вид поля кода стойки (`StaffCodeField`) обычного размера: заливка светлее карточек, рамка 50 %,
 * фокус стальным синим, высота 56 и обычный шрифт. Подпись над полем, справа глазик «показать».
 * Под полем — подсказка серым или отказ алым на её месте.
 *
 * Показан ли пароль — состояние вида, его держит само поле.
 */
defineProps<{
  label: string;
  placeholder: string;
  /** Подсказка под полем. */
  hint?: string;
  /** Отказ под полем алым — вместо подсказки. */
  error?: string;
  required?: boolean;
}>();

const model = defineModel<string>({ required: true });

const shown = ref(false);
</script>

<template>
  <label class="block font-manrope leading-[normal]">
    <span class="mx-0.5 mb-2 mt-5 block text-[14px] font-medium text-xb-secondary">{{ label }}</span>
    <span class="relative block">
      <input
        v-model="model"
        :type="shown ? 'text' : 'password'"
        :placeholder="placeholder"
        :required="required"
        autocomplete="new-password"
        class="box-border block h-14 w-full rounded-[16px] border border-white/50 bg-[#20242C] pl-4 pr-[52px] font-manrope text-[16px] font-medium text-xb-text outline-0 placeholder:font-normal placeholder:text-[#5C6470] focus:border-[#5E7AA3] focus:outline-2 focus:outline-offset-2 focus:outline-[#5E7AA3]"
      />
      <span class="absolute right-2.5 top-1/2 flex -translate-y-1/2">
        <button
          type="button"
          :aria-label="shown ? 'Скрыть пароль' : 'Показать пароль'"
          class="flex size-9 cursor-pointer items-center justify-center rounded-full border-0 bg-white/7 p-0"
          @click="shown = !shown"
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" stroke="#C2C9D3" stroke-width="1.7" stroke-linejoin="round" />
            <circle cx="12" cy="12" r="2.8" stroke="#C2C9D3" stroke-width="1.7" />
            <path v-if="shown" d="M4 20L20 4" stroke="#C2C9D3" stroke-width="1.7" stroke-linecap="round" />
          </svg>
        </button>
      </span>
    </span>
    <span v-if="error" class="mt-2 block px-0.5 text-[13px] font-medium text-xb-scarlet-soft">{{ error }}</span>
    <span v-else-if="hint" class="mt-2 block px-0.5 text-[13px] font-light text-xb-grey">{{ hint }}</span>
  </label>
</template>
