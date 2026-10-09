<script setup lang="ts">
import { computed } from 'vue';

/**
 * Строка цены — `.price-row` в `_reference/design/web/dashboard/03-depth.html` (issue #442):
 * подпись слева, число справа, под ними полоса и серая подпись.
 *
 * Роли — эталона: подпись — Manrope 15 / 500 цветом названия плитки, число — 20 / 700 белым,
 * полоса — 8 высотой на подложке цвета линии, подпись под ней — 12 / 300 серым.
 *
 * Цвет полосы — смысловой тон, а не цвет: лидер — циан, как на «Рычагах», остальные — тёмный
 * бирюзовый, новичок — серо-бирюзовый (`03-depth-ltv.md`, «Правила»). Длина — доля от 0 до 100;
 * доли нет — полоса пустая.
 *
 * Расстояние между строками ставит список, строка своего отступа снаружи не имеет.
 */
type PriceRowTone = 'leader' | 'others' | 'newcomer';

const props = defineProps<{
  label: string;
  /** Число справа, уже в виде: «2,8 млн». */
  value: string;
  /** Длина полосы, доля от 0 до 100. */
  share: number | null;
  tone: PriceRowTone;
  /** Серая подпись под полосой. */
  hint?: string;
}>();

const TONE_CLASSES: Record<PriceRowTone, string> = {
  leader: 'bg-web-cyan',
  others: 'bg-web-teal-mid',
  newcomer: 'bg-web-title',
};

const width = computed(() => `${Math.min(Math.max(props.share ?? 0, 0), 100)}%`);
</script>

<template>
  <div class="font-manrope">
    <div class="flex items-baseline justify-between gap-3">
      <span class="text-[15px] font-medium text-web-title">{{ label }}</span>
      <b class="text-[20px] font-bold whitespace-nowrap text-web-text">{{ value }}</b>
    </div>
    <div class="mt-2 h-2 overflow-hidden rounded bg-web-line">
      <i class="block h-full rounded" :class="TONE_CLASSES[tone]" :style="{ width }" />
    </div>
    <span v-if="hint" class="mt-1.5 block text-[12px] font-light text-web-grey">{{ hint }}</span>
  </div>
</template>
