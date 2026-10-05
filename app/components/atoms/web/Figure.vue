<script setup lang="ts">
/**
 * Число плитки веба — роли «Герой» и «Число плитки» кодекса (`_reference/design/web/codex.html`,
 * «Шрифты»), с единицей при числе.
 *
 * Герой — одна цифра на экран: Unbounded 60 / 700, на телефоне 44. Число плитки — 34 / 700,
 * на телефоне не меняется. Единица — Manrope 16 / 500 цветом названия плитки, без разрядки
 * числа: разрядка −3 у героя сжала бы и её.
 *
 * Тон `quiet` — число цветом названия плитки: цифра, которая не результат, а справка рядом
 * с результатами, — «Уже были в программе» раздела «Промо» (issue #380). Тон `muted` — прочерк
 * цветом оси вместо числа, которого нет: «не считаем» и «лидеров нет» (issue #402).
 *
 * Своего отступа сверху у числа нет: расстояние до названия плитки ставит тот, кто их собирает.
 */
type FigureSize = 'hero' | 'tile';
type FigureTone = 'default' | 'quiet' | 'muted';

const props = withDefaults(defineProps<{
  /** Число строкой, как его показать: «134,6», «83 120». */
  value: string;
  /** «млн сум», «сум», «из 431». */
  unit?: string;
  size: FigureSize;
  tone?: FigureTone;
}>(), { unit: undefined, tone: 'default' });

const TONE_CLASSES: Record<FigureTone, string> = {
  default: 'text-web-text',
  quiet: 'text-web-title',
  muted: 'text-web-axis',
};

const SIZE_CLASSES: Record<FigureSize, string> = {
  hero: 'text-[60px] leading-none tracking-[-3px] max-web:text-[44px] max-web:tracking-[-2px]',
  tile: 'text-[34px] leading-[1.05] tracking-[-1px]',
};
</script>

<template>
  <div class="font-unbounded font-bold" :class="[SIZE_CLASSES[size], TONE_CLASSES[props.tone]]">
    {{ value }}<span
      v-if="unit"
      class="ml-2 font-manrope text-[16px] font-medium tracking-normal text-web-title"
    >{{ unit }}</span>
  </div>
</template>
