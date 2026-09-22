<script setup lang="ts">
/**
 * Шапка блока на главной: заголовок и ссылка в раздел — «Мои заказы · Все заказы ›».
 *
 * Правило общее у блоков главной: короткий срез и вход в раздел, а вся работа со списком
 * живёт внутри раздела. Ссылки нет — блок ведёт в никуда, и шапка остаётся одним заголовком
 * (отказ загрузки, «Ваша неделя»). Справа вместо ссылки может стоять своё — слотом `aside`,
 * как срок недели у акции.
 *
 * Заголовок — Unbounded 17/600, ссылка — 14/500 светло-серым (шкала шрифтов).
 */
defineProps<{
  title: string;
  /** Подпись ссылки в раздел. Нет — ссылки нет. */
  linkLabel?: string;
}>();

defineEmits<{ open: [] }>();
</script>

<template>
  <div class="flex items-baseline justify-between gap-3">
    <h3 class="m-0 font-unbounded text-[17px] font-semibold tracking-[-0.4px] text-xb-text">{{ title }}</h3>
    <button
      v-if="linkLabel"
      type="button"
      class="inline-flex shrink-0 cursor-pointer items-center gap-[5px] border-0 bg-transparent p-0 font-manrope text-[14px] font-medium text-xb-light"
      @click="$emit('open')"
    >
      {{ linkLabel }}
      <AtomsNextMemberChevron tone="light" :size="14" />
    </button>
    <slot v-else name="aside" />
  </div>
</template>
