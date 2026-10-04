<script setup lang="ts">
import { computed, ref, useId } from 'vue';

/**
 * Текстовое поле формы веба (`codex.md`, «Формы — решено»; `.field` в
 * `_reference/design/web/promo/02-new.html`): подпись 13 / 600 сверху, у обязательного — алая
 * звёздочка; поле 48 со скруглением 14 на поднятой поверхности; подсказка 12 серым под полем.
 *
 * Фокус — циановая обводка 1,5; ошибка — алая обводка и алый текст вместо подсказки,
 * `aria-invalid` и `aria-describedby` на текст ошибки. Своей проверки нет и `required` нет:
 * ошибку присылает сервер после попытки сохранить, браузер форму не останавливает.
 *
 * `focus()` — наружу: первое поле с ошибкой получает фокус, и решает это форма.
 */
const props = defineProps<{
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  /** Поле получает фокус при открытии окна. */
  autofocus?: boolean;
}>();

const value = defineModel<string>({ required: true });

const id = useId();
const input = ref<HTMLInputElement | null>(null);

const describedBy = computed(() => (props.error ? `${id}-error` : props.hint ? `${id}-hint` : undefined));

defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <div>
    <label :for="id" class="mb-2 block font-manrope text-[13px] font-semibold text-web-title">
      {{ label }}<span v-if="required" class="ml-0.5 text-web-scarlet" aria-hidden="true">*</span>
    </label>
    <input
      :id="id"
      ref="input"
      v-model="value"
      type="text"
      :autofocus="autofocus"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      :aria-required="required ? 'true' : undefined"
      class="h-12 w-full rounded-[14px] border-0 bg-web-raised px-4 font-manrope text-[15px] font-medium text-web-text outline-none placeholder:text-web-axis"
      :class="error ? 'inset-ring-[1.5px] inset-ring-web-scarlet' : 'inset-ring inset-ring-web-line focus:inset-ring-[1.5px] focus:inset-ring-web-cyan/60'"
    />
    <AtomsWebFieldError v-if="error" :id="`${id}-error`" :text="error" />
    <p v-else-if="hint" :id="`${id}-hint`" class="m-0 mt-1.5 font-manrope text-[12px] leading-[1.45] text-web-grey">{{ hint }}</p>
  </div>
</template>
