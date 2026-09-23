<script setup lang="ts">
/**
 * Пилюля акции в шапке главной: мерцающая звезда и прогресс «3 / 5», вокруг — золотая пыль.
 *
 * Стоит там, где раньше был баланс, и той же высоты — 36 px: баланс переехал в центр экрана,
 * второе такое же число в шапке не нужно. Нажатие ведёт в акцию.
 *
 * Пыль — частицы качаются на месте и загораются вразнобой, как в луче света. Раскладка
 * частиц снята с эталона главного экрана как есть: случайная раскладка при каждой
 * отрисовке разошлась бы между сервером и браузером.
 */
defineProps<{
  done: number;
  total: number;
  /** Подпись для экранного чтеца: на пилюле только звезда и цифры. */
  label: string;
}>();

defineEmits<{ open: [] }>();

interface DustParticle {
  left: number;
  top: number;
  size: number;
  color: string;
  drift: 'a' | 'b' | 'c' | 'd';
  driftDuration: number;
  driftDelay: number;
  twinkleDuration: number;
  twinkleDelay: number;
}

const DUST: DustParticle[] = [
  { left: 21.3, top: 50.3, size: 1.8, color: '#FFF3D2', drift: 'd', driftDuration: 9.0, driftDelay: -0.1, twinkleDuration: 4.2, twinkleDelay: -3.0 },
  { left: 75.9, top: 55.6, size: 3, color: '#FFE7AE', drift: 'a', driftDuration: 9.7, driftDelay: -4.8, twinkleDuration: 3.1, twinkleDelay: -2.9 },
  { left: -2.8, top: 22.0, size: 2.2, color: '#FFD27A', drift: 'd', driftDuration: 12.4, driftDelay: -0.8, twinkleDuration: 3.0, twinkleDelay: -2.8 },
  { left: 79.6, top: -4.6, size: 1.8, color: '#FFD27A', drift: 'a', driftDuration: 10.8, driftDelay: -1.3, twinkleDuration: 4.6, twinkleDelay: -0.7 },
  { left: 55.5, top: 101.7, size: 1.5, color: '#FFE7AE', drift: 'c', driftDuration: 12.5, driftDelay: -0.9, twinkleDuration: 4.4, twinkleDelay: -0.1 },
  { left: 48.3, top: 104.6, size: 1.8, color: '#FFE7AE', drift: 'd', driftDuration: 11.7, driftDelay: -0.1, twinkleDuration: 3.4, twinkleDelay: -1.9 },
  { left: 104.0, top: 88.3, size: 1.5, color: '#FFF3D2', drift: 'c', driftDuration: 15.0, driftDelay: -1.0, twinkleDuration: 3.7, twinkleDelay: -1.8 },
  { left: 88.0, top: -4.8, size: 2.2, color: '#FFD27A', drift: 'c', driftDuration: 11.2, driftDelay: -1.7, twinkleDuration: 4.3, twinkleDelay: -2.4 },
  { left: 95.5, top: 46.4, size: 2.2, color: '#FFD27A', drift: 'd', driftDuration: 8.7, driftDelay: -0.3, twinkleDuration: 2.3, twinkleDelay: -2.1 },
  { left: 55.8, top: 94.8, size: 2, color: '#FFE7AE', drift: 'b', driftDuration: 9.0, driftDelay: -3.1, twinkleDuration: 3.5, twinkleDelay: -0.5 },
  { left: 27.4, top: 93.8, size: 3, color: '#FFF3D2', drift: 'c', driftDuration: 7.1, driftDelay: -4.8, twinkleDuration: 3.8, twinkleDelay: -1.1 },
  { left: 75.6, top: 47.4, size: 1.5, color: '#FFF3D2', drift: 'd', driftDuration: 12.1, driftDelay: -4.4, twinkleDuration: 2.5, twinkleDelay: -1.3 },
  { left: 95.3, top: 66.2, size: 2, color: '#FFF3D2', drift: 'd', driftDuration: 9.6, driftDelay: -6.0, twinkleDuration: 3.8, twinkleDelay: -1.3 },
  { left: 51.3, top: 60.7, size: 2.2, color: '#FFF3D2', drift: 'b', driftDuration: 11.9, driftDelay: -13.9, twinkleDuration: 2.5, twinkleDelay: -0.5 },
  { left: 23.2, top: 37.3, size: 2.6, color: '#F7C25B', drift: 'a', driftDuration: 9.6, driftDelay: -13.3, twinkleDuration: 2.9, twinkleDelay: -0.3 },
  { left: 100.8, top: 0.4, size: 2.2, color: '#FFE7AE', drift: 'c', driftDuration: 12.8, driftDelay: -1.7, twinkleDuration: 3.5, twinkleDelay: -2.6 },
  { left: 76.7, top: 99.5, size: 2.6, color: '#FFE7AE', drift: 'a', driftDuration: 13.7, driftDelay: -10.6, twinkleDuration: 4.0, twinkleDelay: -3.3 },
  { left: 62.7, top: 63.3, size: 1.8, color: '#FFF3D2', drift: 'd', driftDuration: 14.9, driftDelay: -3.2, twinkleDuration: 3.3, twinkleDelay: -3.5 },
  { left: 17.0, top: 101.2, size: 2.2, color: '#FFD27A', drift: 'a', driftDuration: 10.7, driftDelay: -12.9, twinkleDuration: 4.6, twinkleDelay: -3.5 },
  { left: 89.8, top: 68.1, size: 2.6, color: '#FFF3D2', drift: 'b', driftDuration: 13.8, driftDelay: -11.2, twinkleDuration: 4.0, twinkleDelay: -2.2 },
  { left: 19.8, top: 69.7, size: 2.2, color: '#FFE7AE', drift: 'b', driftDuration: 14.7, driftDelay: -11.1, twinkleDuration: 4.1, twinkleDelay: -3.2 },
  { left: 12.0, top: 86.6, size: 1.5, color: '#FFE7AE', drift: 'b', driftDuration: 13.8, driftDelay: -3.7, twinkleDuration: 3.3, twinkleDelay: -3.9 },
  { left: 31.0, top: 100.0, size: 2, color: '#FFE7AE', drift: 'b', driftDuration: 7.7, driftDelay: -6.6, twinkleDuration: 4.1, twinkleDelay: -2.8 },
  { left: 14.8, top: 47.0, size: 2, color: '#F7C25B', drift: 'd', driftDuration: 7.7, driftDelay: -3.3, twinkleDuration: 3.8, twinkleDelay: -1.8 },
  { left: -2.4, top: 50.5, size: 2.2, color: '#FFF3D2', drift: 'c', driftDuration: 9.6, driftDelay: -5.8, twinkleDuration: 3.3, twinkleDelay: -3.8 },
  { left: 30.6, top: 74.2, size: 1.5, color: '#FFE7AE', drift: 'd', driftDuration: 10.5, driftDelay: -9.4, twinkleDuration: 2.7, twinkleDelay: -0.3 },
  { left: 102.2, top: 99.8, size: 2.2, color: '#FFF3D2', drift: 'a', driftDuration: 10.9, driftDelay: -1.5, twinkleDuration: 4.2, twinkleDelay: -1.3 },
  { left: 39.1, top: 51.2, size: 1.8, color: '#F7C25B', drift: 'd', driftDuration: 8.4, driftDelay: -7.2, twinkleDuration: 4.1, twinkleDelay: -3.7 },
  { left: 84.4, top: 95.2, size: 1.5, color: '#F7C25B', drift: 'c', driftDuration: 7.2, driftDelay: -8.4, twinkleDuration: 2.9, twinkleDelay: -2.2 },
  { left: 80.9, top: 67.0, size: 2.2, color: '#FFD27A', drift: 'd', driftDuration: 12.2, driftDelay: -13.2, twinkleDuration: 2.4, twinkleDelay: -0.1 },
];

// Анимация — классом, а не строкой в `style`: имена `@keyframes` в `<style scoped>`
// получают приставку области, и строка из разметки их бы не нашла. Сроки — переменными.
function particleStyle(particle: DustParticle): Record<string, string> {
  return {
    left: `${particle.left}%`,
    top: `${particle.top}%`,
    width: `${particle.size}px`,
    height: `${particle.size}px`,
    background: particle.color,
    '--drift-duration': `${particle.driftDuration}s`,
    '--drift-delay': `${particle.driftDelay}s`,
    '--twinkle-duration': `${particle.twinkleDuration}s`,
    '--twinkle-delay': `${particle.twinkleDelay}s`,
  };
}
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    class="relative flex cursor-pointer items-center border-0 bg-transparent p-0 font-manrope"
    @click="$emit('open')"
  >
    <span class="promo-dust" aria-hidden="true">
      <i
        v-for="(particle, index) in DUST"
        :key="index"
        :class="`promo-drift-${particle.drift}`"
        :style="particleStyle(particle)"
      />
    </span>
    <span class="promo-pill">
      <svg class="promo-star" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M12 2.6l2.55 6.05 6.55.52-4.98 4.27 1.52 6.4L12 16.4l-5.64 3.44 1.52-6.4-4.98-4.27 6.55-.52z"
          fill="currentColor"
        />
      </svg>
      <span class="flex items-center gap-[3px] text-[14px] font-medium tracking-[0.4px] tabular-nums text-[#FFE7B4]">
        <span>{{ done }}</span>
        <span class="font-extralight text-[rgba(255,231,180,0.45)]">/</span>
        <span>{{ total }}</span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.promo-pill {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  height: 36px;
  padding: 0 14px 0 11px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(255, 214, 120, 0.2) 0%, rgba(214, 158, 54, 0.13) 100%);
  border: 1px solid rgba(255, 220, 140, 0.42);
  box-shadow: 0 0 14px rgba(255, 199, 92, 0.2), inset 0 1px 0 rgba(255, 240, 200, 0.28);
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
}

.promo-star {
  color: #ffd98a;
  animation: promo-star-pulse 2.6s ease-in-out infinite;
}

@keyframes promo-star-pulse {
  0%,
  100% {
    opacity: 0.72;
    transform: scale(0.94) rotate(0deg);
    filter: drop-shadow(0 0 3px rgba(255, 205, 105, 0.45));
  }

  45% {
    opacity: 1;
    transform: scale(1.08) rotate(6deg);
    filter: drop-shadow(0 0 9px rgba(255, 214, 120, 0.95));
  }
}

.promo-dust {
  position: absolute;
  z-index: 1;
  inset: -24px -26px;
  pointer-events: none;
  mix-blend-mode: screen;
}

.promo-dust i {
  position: absolute;
  border-radius: 50%;
  opacity: 0;
  will-change: transform, opacity;
  filter: blur(0.4px);
}

.promo-drift-a { animation: promo-dust-a var(--drift-duration) linear var(--drift-delay) infinite, promo-twinkle var(--twinkle-duration) ease-in-out var(--twinkle-delay) infinite; }
.promo-drift-b { animation: promo-dust-b var(--drift-duration) linear var(--drift-delay) infinite, promo-twinkle var(--twinkle-duration) ease-in-out var(--twinkle-delay) infinite; }
.promo-drift-c { animation: promo-dust-c var(--drift-duration) linear var(--drift-delay) infinite, promo-twinkle var(--twinkle-duration) ease-in-out var(--twinkle-delay) infinite; }
.promo-drift-d { animation: promo-dust-d var(--drift-duration) linear var(--drift-delay) infinite, promo-twinkle var(--twinkle-duration) ease-in-out var(--twinkle-delay) infinite; }

@keyframes promo-dust-a { 0% { transform: translate(0, 0); } 50% { transform: translate(7px, -11px); } 100% { transform: translate(0, 0); } }
@keyframes promo-dust-b { 0% { transform: translate(0, 0); } 50% { transform: translate(-9px, -7px); } 100% { transform: translate(0, 0); } }
@keyframes promo-dust-c { 0% { transform: translate(0, 0); } 50% { transform: translate(5px, 9px); } 100% { transform: translate(0, 0); } }
@keyframes promo-dust-d { 0% { transform: translate(0, 0); } 50% { transform: translate(-6px, 10px); } 100% { transform: translate(0, 0); } }
@keyframes promo-twinkle { 0%, 100% { opacity: 0; } 35% { opacity: 0.85; } 65% { opacity: 0.25; } }

@media (prefers-reduced-motion: reduce) {
  .promo-star,
  .promo-dust i {
    animation: none !important;
  }

  .promo-dust i {
    opacity: 0.5;
  }
}
</style>
