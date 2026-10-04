<script setup lang="ts">
import { PhInfo } from '@phosphor-icons/vue';

/**
 * Значок (i) у подписи метрики — `.info` в `_reference/design/web/dashboard/02-levers.html`
 * (`codex.md`, «Подсказка метрики»): Phosphor `info` duotone 18 цветом `axis`, поле нажатия 28
 * по кругу; открытый — циан на поднятой подложке.
 *
 * Нажатие не всплывает: плитка-вход под значком не открывается, а щелчок мимо подсказки
 * не закрывает её в ту же секунду. Что открыто — решает тот, кто ставит значок.
 */
defineProps<{
  /** Название метрики: «Что это: {название}» для чтения с экрана. */
  title: string;
  expanded: boolean;
}>();

defineEmits<{ click: [] }>();
</script>

<template>
  <button
    type="button"
    class="-my-1.5 ml-0.5 inline-grid size-7 cursor-pointer place-items-center rounded-full border-0 p-0 align-middle hover:bg-web-raised hover:text-web-cyan focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-web-cyan"
    :class="expanded ? 'bg-web-raised text-web-cyan' : 'bg-transparent text-web-axis'"
    :aria-label="`Что это: ${title}`"
    :aria-expanded="expanded"
    @click.stop.prevent="$emit('click')"
  >
    <PhInfo weight="duotone" aria-hidden="true" class="size-[18px]" />
  </button>
</template>
