<script setup lang="ts">
import type { AutosaveState } from '~/composables/useDraftAutosave';

/**
 * Отметка рядом с черновиком: сохраняем, сохранено или не сохранилось и почему.
 *
 * Без неё автосохранение неотличимо от его отсутствия: человек не знает, можно ли закрыть
 * вкладку, и ищет кнопку «Сохранить», которой нет (issue #148).
 */
defineProps<{
  state: AutosaveState;
  /** Что ответил сервер на последнюю попытку. */
  error: string | null;
}>();
</script>

<template>
  <p class="text-sm" :class="state === 'failed' ? 'text-red-700' : 'text-slate-500'">
    <template v-if="state === 'saving'">Сохраняем…</template>
    <template v-else-if="state === 'saved'">Сохранено.</template>
    <template v-else-if="state === 'failed'">Не сохранено. {{ error }}</template>
    <template v-else>Черновик сохраняется сам, по мере правки.</template>
  </p>
</template>
