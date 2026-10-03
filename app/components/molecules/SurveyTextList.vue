<script setup lang="ts">
/**
 * Ответы словами списком (issue #325) — у текстового вопроса и у «Своего варианта». Подпись
 * группы — колонка среза, в которую попал ответивший; без среза её нет.
 *
 * Список в рамке с прокруткой: ответов бывают сотни, и без потолка высоты таблица под ним
 * уехала бы на несколько экранов.
 */
defineProps<{
  title: string;
  texts: { text: string; group: string | null }[];
}>();
</script>

<template>
  <div>
    <p class="text-xs font-medium text-slate-500">{{ title }} · {{ texts.length }}</p>
    <ul class="mt-1 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
      <li v-for="(entry, index) in texts" :key="index" class="px-3 py-2 text-sm">
        <span class="whitespace-pre-line text-slate-900">{{ entry.text }}</span>
        <span v-if="entry.group" class="ml-2 text-xs text-slate-500">{{ entry.group }}</span>
      </li>
    </ul>
  </div>
</template>
