<script setup lang="ts">
import { PhWarningCircle } from '@phosphor-icons/vue';

/**
 * Текст ошибки под полем формы веба (`codex.md`, «Формы — решено»): алый 12 / 500 со значком
 * `warning-circle`, вместо подсказки поля. Текст — из словаря отказов, его прислал сервер.
 *
 * `id` — для `aria-describedby` поля: читалка экрана называет ошибку вместе с полем.
 */
defineProps<{
  id: string;
  text: string;
}>();
</script>

<template>
  <p :id="id" class="m-0 mt-1.5 flex items-start gap-1.5 font-manrope text-[12px] leading-[1.45] font-medium text-web-scarlet">
    <PhWarningCircle weight="duotone" aria-hidden="true" class="mt-px size-4 shrink-0" />{{ text }}
  </p>
</template>
