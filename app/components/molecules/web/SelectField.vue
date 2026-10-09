<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { PhCaretDown } from '@phosphor-icons/vue';
import type { SelectOption } from '~/types/selectOption';

/**
 * Поле выбора формы веба — то же, что `MoleculesWebTextField` (`codex.md`, «Формы — решено»),
 * со списком вместо ввода: «Действует с ▾» окна «Расходы на найм» (`03-depth-hire-dialog.html`,
 * issue #445). Подпись 13 / 600, у обязательного — алая звёздочка; поле 48 со скруглением 14
 * на поднятой поверхности, справа — стрелка; подсказка 12 серым под полем.
 *
 * Список — родной `<select>`: клавиатура, чтение с экрана и список на телефоне — от браузера.
 * Ошибка — алая обводка и алый текст вместо подсказки, `aria-invalid` и `aria-describedby`.
 * Своей проверки и `required` нет: ошибку присылает сервер после попытки сохранить.
 *
 * `focus()` — наружу: первое поле с ошибкой получает фокус, и решает это форма.
 */
const props = defineProps<{
  label: string;
  options: SelectOption[];
  required?: boolean;
  hint?: string;
  error?: string | null;
}>();

const value = defineModel<string>({ required: true });

const id = useId();
const select = ref<HTMLSelectElement | null>(null);

const describedBy = computed(() => (props.error ? `${id}-error` : props.hint ? `${id}-hint` : undefined));

defineExpose({ focus: () => select.value?.focus() });
</script>

<template>
  <div>
    <label :for="id" class="mb-2 block font-manrope text-[13px] font-semibold text-web-title">
      {{ label }}<span v-if="required" class="ml-0.5 text-web-scarlet" aria-hidden="true">*</span>
    </label>
    <div class="relative">
      <select
        :id="id"
        ref="select"
        v-model="value"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        :aria-required="required ? 'true' : undefined"
        class="h-12 w-full cursor-pointer appearance-none rounded-[14px] border-0 bg-web-raised pr-11 pl-4 font-manrope text-[15px] font-medium text-web-text outline-none"
        :class="error ? 'inset-ring-[1.5px] inset-ring-web-scarlet' : 'inset-ring inset-ring-web-line focus:inset-ring-[1.5px] focus:inset-ring-web-cyan/60'"
      >
        <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
      <PhCaretDown
        weight="bold"
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 right-4 size-3.5 -translate-y-1/2 text-web-title"
      />
    </div>
    <AtomsWebFieldError v-if="error" :id="`${id}-error`" :text="error" />
    <p v-else-if="hint" :id="`${id}-hint`" class="m-0 mt-1.5 font-manrope text-[12px] leading-[1.45] text-web-grey">{{ hint }}</p>
  </div>
</template>
