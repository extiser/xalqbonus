<script setup lang="ts">
/**
 * Полоски сторис над экранами опроса (`_reference/design/survey/`): по полоске на вопрос.
 * Пройденные и текущая — белые, впереди — тусклые. На экране открытия белых нет, на финале
 * белые все.
 */
defineProps<{
  count: number;
  /** Сколько полосок белые — пройденные вместе с текущей. */
  filled: number;
}>();
</script>

<template>
  <div class="flex gap-1" aria-hidden="true">
    <i
      v-for="bar in count"
      :key="bar"
      class="h-[3px] flex-1 rounded-[2px]"
      :class="bar <= filled ? 'bg-xb-text' : 'bg-white/18'"
    />
  </div>
</template>
