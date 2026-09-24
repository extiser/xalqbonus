import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ComputedRef } from 'vue';

/**
 * Набор числа вверх от нуля — баллы на главной (`_reference/design/home/main-screen.html`).
 *
 * Водитель открывает экран ради этого числа, и оно должно набраться у него на глазах, а не стоять
 * готовым. Набор один на два места: крупное число в центре и баланс в липкой шапке считаются
 * вместе (`section-bar.md`, «Шапка главной»), поэтому он живёт здесь, а не в одном из них.
 *
 * Сервер рисует итог сразу — набор начинается только в браузере; `prefers-reduced-motion`
 * его выключает. Новое значение набирается заново.
 *
 * Разряды разбиваются неразрывным пробелом здесь же — одинаково на сервере и в браузере,
 * без зависимости от того, какая локаль собрана в движке.
 */

/** Длительность набора, мс — снята с эталона главного экрана. */
const COUNT_DURATION = 1100;

function formatPoints(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function useCountUp(target: () => number): ComputedRef<string> {
  const shown = ref(target());

  let frame: number | null = null;

  function stop(): void {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  }

  function countUp(value: number): void {
    stop();

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shown.value = value;

      return;
    }

    let startedAt: number | null = null;

    const step = (timestamp: number): void => {
      startedAt ??= timestamp;

      const progress = Math.min((timestamp - startedAt) / COUNT_DURATION, 1);

      // Замедление к концу: последние разряды набираются медленнее, и глаз успевает их прочитать.
      shown.value = value * (1 - Math.pow(1 - progress, 3));
      frame = progress < 1 ? requestAnimationFrame(step) : null;
    };

    shown.value = 0;
    frame = requestAnimationFrame(step);
  }

  onMounted(() => countUp(target()));
  onBeforeUnmount(stop);
  watch(target, countUp);

  return computed(() => formatPoints(shown.value));
}
