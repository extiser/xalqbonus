import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ComputedRef, Ref } from 'vue';

/**
 * Набор числа баллов — на главной (`_reference/design/home/main-screen.html`) и в шапках разделов.
 *
 * Водитель открывает экран ради этого числа, и в первый раз оно должно набраться у него на глазах,
 * а не стоять готовым. Один раз за открытие приложения — от нуля. Дальше число меняется набором
 * от показанного к новому, а без изменения стоит как есть: возврат на главную или вход в раздел
 * с тем же балансом не набирают его заново (решение Руслана 25-09-2026, issue #210).
 *
 * Поэтому показанное значение общее для всех мест с одним ключом: главная и шапки разделов
 * пересоздаются при каждом переходе, и своё значение у каждого начиналось бы с нуля. Живёт
 * оно на уровне модуля, а не в состоянии Nuxt: пишется только в браузере, из `onMounted`
 * и кадров анимации, и на сервере так и остаётся пустым.
 *
 * Сервер рисует итог сразу — набор начинается только в браузере; `prefers-reduced-motion`
 * его выключает.
 *
 * Разряды разбиваются неразрывным пробелом здесь же — одинаково на сервере и в браузере,
 * без зависимости от того, какая локаль собрана в движке.
 */

/** Длительность набора, мс — снята с эталона главного экрана. */
const COUNT_DURATION = 1100;

/** Набор одного числа — общий для всех мест с его ключом. */
type CountState = {
  /** Показанное значение. `null` — за это открытие приложения число ещё не показывалось. */
  shown: Ref<number | null>;
  /** К чему идёт набор. `null` — набора нет. */
  heading: number | null;
  frame: number | null;
  /** Сколько мест с этим ключом сейчас на экране. Ушло последнее — набор останавливается. */
  holders: number;
};

const states = new Map<string, CountState>();

function stateOf(key: string): CountState {
  let state = states.get(key);

  if (!state) {
    state = { shown: ref(null), heading: null, frame: null, holders: 0 };
    states.set(key, state);
  }

  return state;
}

function formatPoints(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
}

function stop(state: CountState): void {
  if (state.frame !== null) {
    cancelAnimationFrame(state.frame);
    state.frame = null;
  }

  state.heading = null;
}

/** Набирает от показанного к `value`; показано ещё не было — от нуля. */
function countTo(state: CountState, value: number): void {
  // Набор к этому же числу уже идёт — второе место на экране его не перезапускает.
  if (state.heading === value) {
    return;
  }

  const from = state.shown.value ?? 0;

  stop(state);

  if (from === value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    state.shown.value = value;

    return;
  }

  let startedAt: number | null = null;

  const step = (timestamp: number): void => {
    startedAt ??= timestamp;

    const progress = Math.min((timestamp - startedAt) / COUNT_DURATION, 1);

    // Замедление к концу: последние разряды набираются медленнее, и глаз успевает их прочитать.
    state.shown.value = from + (value - from) * (1 - Math.pow(1 - progress, 3));

    if (progress < 1) {
      state.frame = requestAnimationFrame(step);
    } else {
      state.frame = null;
      state.heading = null;
    }
  };

  state.heading = value;
  state.shown.value = from;
  state.frame = requestAnimationFrame(step);
}

/**
 * Число в наборе готовой строкой. `key` — чьё это число: места с одним ключом показывают
 * одно и то же и набирают вместе.
 */
export function useCountUp(target: () => number, key = 'balance'): ComputedRef<string> {
  const state = stateOf(key);

  onMounted(() => {
    state.holders += 1;
    countTo(state, target());
  });

  onBeforeUnmount(() => {
    state.holders -= 1;

    // Экран ушёл посреди набора, и других мест с этим числом нет — дальше набирать некому.
    // Показанным считается итог: следующий экран не должен досчитывать то, чего водитель не видел.
    if (state.holders === 0 && state.heading !== null) {
      state.shown.value = state.heading;
      stop(state);
    }
  });

  watch(target, (value) => countTo(state, value));

  // До первого набора — итог: так его рисует сервер, и гидрация не расходится с разметкой.
  return computed(() => formatPoints(state.shown.value ?? target()));
}
