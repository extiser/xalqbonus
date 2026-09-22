<script setup lang="ts">
/**
 * Кнопка водительского Mini App — по шкале из `product/design/README.md`, «Шкала шрифтов».
 *
 * Размер задаёт форму, тон — смысл. Основные (`garnet`, `gold`, `scarlet`) пишутся весом 700,
 * вторичные (`grey`, `danger`, `outline`) — 600: вторичная не должна спорить по весу
 * с основной, стоящей над ней в той же шторке.
 *
 * Своего отступа снаружи у кнопки нет, как и ширины, кроме `l` — та по шкале «во всю ширину»,
 * и это форма кнопки, а не её место.
 *
 * Кнопка стоит на `z-index: 1`: свечение гранатовой выходит за её габариты и иначе ложится
 * поверх соседа снизу. Соседям, которые должны остаться над свечением, контейнер даёт тот же
 * `relative z-[1]` — две кнопки подряд разводятся сами, порядком в разметке.
 */
type ButtonSize = 'l' | 'm' | 's';
type ButtonTone = 'garnet' | 'gold' | 'scarlet' | 'grey' | 'danger' | 'outline';

const props = withDefaults(
  defineProps<{
    size?: ButtonSize;
    tone?: ButtonTone;
    disabled?: boolean;
  }>(),
  { size: 'l', tone: 'garnet', disabled: false },
);

defineEmits<{ click: [] }>();

const SIZE_CLASSES: Record<ButtonSize, string> = {
  l: 'h-[52px] w-full rounded-[16px] px-4 text-[15px]',
  m: 'h-12 rounded-full px-[30px] text-[15px]',
  s: 'h-10 rounded-full px-[22px] text-[14px]',
};

const TONE_CLASSES: Record<ButtonTone, string> = {
  garnet: 'bg-xb-garnet font-bold text-white disabled:opacity-35 disabled:shadow-none',
  gold: 'member-button-gold bg-[linear-gradient(135deg,#FFD98A_0%,#E9A93C_100%)] font-bold text-[#2A1B05] disabled:opacity-35',
  scarlet: 'bg-xb-scarlet font-bold text-white disabled:opacity-35',
  grey: 'bg-xb-button-grey font-semibold text-xb-secondary disabled:opacity-35',
  danger:
    'border border-[rgba(255,92,120,0.40)] bg-[rgba(255,92,120,0.08)] font-semibold text-xb-scarlet-soft disabled:opacity-35',
  outline: 'border border-white/14 bg-white/5 font-semibold text-xb-text disabled:opacity-35',
};

/**
 * Свечение гранатовой: у кнопки посреди экрана («Обменять баллы», M) оно крупное — она
 * одна на экране и зовёт; в шторке (L) — сдержанное, там рядом стоит серая «Закрыть».
 */
const GARNET_GLOW: Record<ButtonSize, string> = {
  l: 'shadow-[0_6px_16px_rgba(232,54,93,0.22)]',
  m: 'shadow-[0_8px_26px_rgba(232,54,93,0.38)]',
  s: 'shadow-[0_6px_16px_rgba(232,54,93,0.22)]',
};
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    class="relative z-[1] inline-flex shrink-0 cursor-pointer items-center justify-center font-manrope transition-opacity disabled:cursor-default"
    :class="[SIZE_CLASSES[props.size], TONE_CLASSES[props.tone], props.tone === 'garnet' ? GARNET_GLOW[props.size] : '']"
    @click="$emit('click')"
  >
    <slot />
  </button>
</template>

<style scoped>
/* Золотая дышит свечением — как кнопка на плашке приглашения. */
.member-button-gold:not(:disabled) {
  box-shadow: 0 8px 22px rgba(233, 169, 60, 0.34);
  animation: member-button-breath 2.8s ease-in-out infinite;
}

@keyframes member-button-breath {
  0%,
  100% {
    box-shadow: 0 8px 22px rgba(233, 169, 60, 0.28);
  }

  50% {
    box-shadow: 0 8px 30px rgba(255, 205, 105, 0.55);
  }
}

@media (prefers-reduced-motion: reduce) {
  .member-button-gold:not(:disabled) {
    animation: none;
  }
}
</style>
