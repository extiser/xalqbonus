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
 * бирюзовый, новичок — серо-бирюзовый (`03-depth-ltv.md`, «Правила»); ушедшие в «Можно вернуть»
 * (issue #446) — бирюзовый `.pool-row`. Длина — доля от 0 до 100; доли нет — полоса пустая.
 *
 * Светлая часть (`part`) — доля самой полосы слева, своим тоном: «ездили много» внутри ушедших.
 * Вид `muted` — без полосы, подпись и число серым: «Больше года» (`.pool-row.muted`).
 *
 * Расстояние между строками ставит список, строка своего отступа снаружи не имеет.
 */
type PriceRowTone = 'leader' | 'others' | 'newcomer' | 'left';

const props = defineProps<{
  label: string;
  /** Число справа, уже в виде: «2,8 млн». */
  value: string;
  /** Длина полосы, доля от 0 до 100. */
  share: number | null;
  tone: PriceRowTone;
  /** Светлая часть полосы: доля самой полосы от 0 до 100 и её тон. */
  part?: { share: number; tone: PriceRowTone };
  /** Без полосы, подпись и число серым. */
  muted?: boolean;
  /** Серая подпись под полосой. */
  hint?: string;
}>();

const TONE_CLASSES: Record<PriceRowTone, string> = {
  leader: 'bg-web-cyan',
  others: 'bg-web-teal-mid',
  newcomer: 'bg-web-title',
  left: 'bg-web-teal',
};

const percentWidth = (share: number | null | undefined): string => `${Math.min(Math.max(share ?? 0, 0), 100)}%`;

const width = computed(() => percentWidth(props.share));
</script>

<template>
  <div class="font-manrope">
    <div class="flex items-baseline justify-between gap-3">
      <span class="text-[15px] font-medium" :class="muted ? 'text-web-grey' : 'text-web-title'">{{ label }}</span>
      <b class="text-[20px] font-bold whitespace-nowrap" :class="muted ? 'text-web-grey' : 'text-web-text'">{{ value }}</b>
    </div>
    <div v-if="!muted" class="mt-2 h-2 overflow-hidden rounded bg-web-line">
      <i class="relative block h-full rounded" :class="TONE_CLASSES[tone]" :style="{ width }">
        <i
          v-if="part"
          class="absolute inset-y-0 left-0 block rounded"
          :class="TONE_CLASSES[part.tone]"
          :style="{ width: percentWidth(part.share) }"
        />
      </i>
    </div>
    <span v-if="hint" class="mt-1.5 block text-[12px] font-light text-web-grey">{{ hint }}</span>
  </div>
</template>
