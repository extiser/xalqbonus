<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

/**
 * Крупное число экрана — баланс на главной. Unbounded 62/700.
 *
 * При появлении набирается вверх от нуля: водитель открывает экран ради этого числа,
 * и оно должно набраться у него на глазах, а не стоять готовым. Сервер рисует итог сразу —
 * набор начинается только в браузере; `prefers-reduced-motion` его выключает.
 *
 * Число приходит числом, а не строкой: набирать нечего, если оно уже отформатировано.
 * Разряды разбиваются неразрывным пробелом здесь же — одинаково на сервере и в браузере,
 * без зависимости от того, какая локаль собрана в движке.
 */
const props = defineProps<{ value: number }>();

/** Длительность набора, мс — снята с эталона главного экрана. */
const COUNT_DURATION = 1100;

const shown = ref(props.value);

let frame: number | null = null;

function format(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function stop(): void {
  if (frame !== null) {
    cancelAnimationFrame(frame);
    frame = null;
  }
}

function countUp(target: number): void {
  stop();

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    shown.value = target;

    return;
  }

  let startedAt: number | null = null;

  const step = (timestamp: number): void => {
    startedAt ??= timestamp;

    const progress = Math.min((timestamp - startedAt) / COUNT_DURATION, 1);

    // Замедление к концу: последние разряды набираются медленнее, и глаз успевает их прочитать.
    shown.value = target * (1 - Math.pow(1 - progress, 3));
    frame = progress < 1 ? requestAnimationFrame(step) : null;
  };

  shown.value = 0;
  frame = requestAnimationFrame(step);
}

onMounted(() => countUp(props.value));
onBeforeUnmount(stop);
watch(() => props.value, countUp);
</script>

<template>
  <span class="font-unbounded text-[62px] font-bold leading-none tracking-[-3px] tabular-nums text-xb-text">
    {{ format(shown) }}
  </span>
</template>
