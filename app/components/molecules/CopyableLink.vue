<script setup lang="ts">
import { ref, watch } from 'vue';

/**
 * Ссылка, которую пересылают человеку: текстом и кнопкой «Скопировать» (issue #267) —
 * приглашение, «задать пароль», привязка Telegram.
 *
 * Буфер обмена браузер даёт не везде — на странице без https его нет вовсе, — поэтому ссылка
 * стоит на экране текстом и выделяется целиком одним нажатием, а кнопка лишь экономит жест.
 *
 * Рядом с кнопкой — место для действий строки (`#actions`): «Отозвать», «Открыть в Telegram».
 */
const props = defineProps<{
  link: string;
}>();

type CopyState = 'idle' | 'copied' | 'failed';

const copyState = ref<CopyState>('idle');

// Новая ссылка на месте прежней — прежнее «Скопировано» к ней не относится.
watch(
  () => props.link,
  () => {
    copyState.value = 'idle';
  },
);

const copy = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(props.link);
    copyState.value = 'copied';
  } catch {
    copyState.value = 'failed';
  }
};

const COPY_LABELS: Record<CopyState, string> = {
  idle: 'Скопировать',
  copied: 'Скопировано',
  failed: 'Не скопировалось — выделите ссылку',
};
</script>

<template>
  <div class="space-y-2">
    <p class="font-mono text-xs break-all text-slate-700 select-all">{{ link }}</p>
    <div class="flex flex-wrap gap-3">
      <AtomsActionButton :label="COPY_LABELS[copyState]" tone="primary" @click="copy" />
      <slot name="actions" />
    </div>
  </div>
</template>
