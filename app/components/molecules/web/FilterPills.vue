<script setup lang="ts">
import { formatNumber } from '~/utils/format';

/**
 * Пилюли фильтра над таблицей — кодекс веба, «Пилюли фильтра» (issue #471): вид вкладок
 * дашборда (`MoleculesWebLevelTabs`), но кнопками, а не ссылками. 14 / 600; невыбранная — на фоне
 * плитки, выбранная — на поднятой с контуром циан 18 %. У пилюли подпись и число; тон статуса
 * (`tone`) красит только текст и число, без подложки. После первой пилюли — черта: «Все» стоит
 * отдельно от фильтров. Пилюли переносятся на вторую строку, если не помещаются.
 */
export type FilterPillTone = 'default' | 'cyan' | 'gold' | 'green' | 'scarlet';

export type FilterPill<Key extends string> = {
  key: Key;
  label: string;
  count: number;
  tone?: FilterPillTone;
};

defineProps<{
  pills: readonly FilterPill<string>[];
  current: string;
  label: string;
}>();

const emit = defineEmits<{ select: [key: string] }>();

const TONE_CLASSES: Record<FilterPillTone, { label: string; count: string }> = {
  default: { label: '', count: 'text-web-text' },
  cyan: { label: 'text-web-cyan', count: 'text-web-cyan' },
  gold: { label: 'text-web-gold', count: 'text-web-gold' },
  green: { label: 'text-web-green', count: 'text-web-green' },
  scarlet: { label: 'text-web-scarlet-muted', count: 'text-web-scarlet-muted' },
};

const PILL_CLASSES =
  'inline-flex shrink-0 cursor-pointer items-center rounded-full border-0 px-4 py-[9px] font-manrope text-[14px] leading-[1.45] font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan';
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5" role="group" :aria-label="label">
    <template v-for="(pill, index) in pills" :key="pill.key">
      <button
        type="button"
        :aria-pressed="pill.key === current"
        :class="[
          PILL_CLASSES,
          pill.key === current
            ? 'bg-web-raised inset-ring inset-ring-web-cyan/18'
            : 'bg-web-tile hover:text-web-text',
          TONE_CLASSES[pill.tone ?? 'default'].label || (pill.key === current ? 'text-web-text' : 'text-web-title'),
        ]"
        @click="emit('select', pill.key)"
      >
        {{ pill.label }}<span class="ml-1.5 font-bold" :class="TONE_CLASSES[pill.tone ?? 'default'].count">{{ formatNumber(pill.count) }}</span>
      </button>
      <span v-if="index === 0" class="mx-1 h-[22px] w-px self-center bg-web-line" aria-hidden="true" />
    </template>
  </div>
</template>
