<script setup lang="ts">
import type { AutosaveState } from '~/composables/useDraftAutosave';

/**
 * Отметка рядом с черновиком: сохраняем, сохранено или не сохранилось и почему.
 *
 * Без неё автосохранение неотличимо от его отсутствия: человек не знает, можно ли закрыть
 * вкладку, и ищет кнопку «Сохранить», которой нет (issue #148).
 *
 * У «Не сохранено» есть «Повторить»: без неё отметка была тупиком — новая попытка
 * планировалась только следующим набранным знаком, а при отказе сервера и живой сети
 * повтор сам не случится (прогон 15-09-2026). Что делать по нажатию, решает вызывающий.
 */
defineProps<{
  state: AutosaveState;
  /** Что ответил сервер на последнюю попытку. */
  error: string | null;
}>();

const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="state === 'failed'" class="flex flex-wrap items-center gap-3">
    <p class="text-sm text-red-700">Не сохранено. {{ error }}</p>
    <AtomsActionButton label="Повторить" @click="emit('retry')" />
  </div>
  <p v-else class="text-sm text-slate-500">
    <template v-if="state === 'saving'">Сохраняем…</template>
    <template v-else-if="state === 'saved'">Сохранено.</template>
    <template v-else>Черновик сохраняется сам, по мере правки.</template>
  </p>
</template>
