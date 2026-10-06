<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { useMetricInfo } from '~/composables/useMetricInfo';
import { fillMetricText, METRICS, type MetricKey, type MetricValues } from '#shared/metrics';

/**
 * Подсказка метрики — значок (i) и пояснение по нажатию (`codex.md`, «Подсказка метрики»;
 * `.tip` в `_reference/design/web/dashboard/02-levers.html`). Один компонент на весь веб.
 *
 * Текст — определение из общего словаря `shared/metrics.ts` по ключу: название, что это
 * простым языком и под чертой — как считается. Подсказка из равных частей (issue #402) — без
 * «как считается»: части идут абзацами через пустую строку, черты нет. Пороги в тексте и в названии —
 * подстановки, их значения приносит тот, кто ставит значок (`values`).
 *
 * Подсказка висит поверх страницы (`Teleport` в `body`, `position: fixed`): плитка
 * с `overflow: hidden` её не обрезает. Встаёт под значком; не влезает снизу — над ним; у края
 * окна сдвигается внутрь с полем 12. Открыта одна на страницу (`useMetricInfo`). Закрывается
 * повторным нажатием, щелчком мимо и Escape; при прокрутке и смене размера окна едет
 * за значком, а не закрывается: на телефоне окно меняет высоту, когда прячется строка адреса.
 */
const props = defineProps<{
  metric: MetricKey;
  /** Значения подстановок `{имя}` в тексте определения. */
  values?: MetricValues;
}>();

/** Поле от края окна и зазор до значка. */
const EDGE_GAP = 12;
const ANCHOR_GAP = 8;
/** На сколько левее середины значка встаёт левый край подсказки — как в макете. */
const ANCHOR_INSET = 24;

const definition = computed(() => {
  const { title, text, how } = METRICS[props.metric];

  return {
    title: fillMetricText(title, props.values),
    paragraphs: fillMetricText(text, props.values).split('\n\n'),
    how: how === undefined ? null : fillMetricText(how, props.values),
  };
});

const { open, toggle, close } = useMetricInfo(useId());

const anchor = ref<HTMLElement | null>(null);
const tip = ref<HTMLElement | null>(null);
/** `null` — ещё не поставлена: подсказка не показывается в углу окна до первого расчёта. */
const position = ref<{ left: number; top: number } | null>(null);

const place = (): void => {
  const button = anchor.value?.querySelector('button');

  if (!button || !tip.value) return;

  const box = button.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = tip.value;
  const left = Math.min(
    Math.max(EDGE_GAP, box.left + box.width / 2 - ANCHOR_INSET),
    window.innerWidth - width - EDGE_GAP,
  );
  const below = box.bottom + ANCHOR_GAP;
  const top = below + height > window.innerHeight - EDGE_GAP ? box.top - height - ANCHOR_GAP : below;

  position.value = { left, top };
};

const closeOnOutsideClick = (event: MouseEvent): void => {
  if (event.target instanceof Node && tip.value?.contains(event.target)) return;
  close();
};

const closeOnEscape = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') close();
};

const listen = (): void => {
  document.addEventListener('click', closeOnOutsideClick);
  document.addEventListener('keydown', closeOnEscape);
  // Захватом: прокручивается не только окно, но и любая колонка под значком.
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
};

const unlisten = (): void => {
  document.removeEventListener('click', closeOnOutsideClick);
  document.removeEventListener('keydown', closeOnEscape);
  window.removeEventListener('scroll', place, true);
  window.removeEventListener('resize', place);
};

watch(open, async (isOpen) => {
  if (!isOpen) {
    unlisten();
    position.value = null;
    return;
  }

  await nextTick();
  place();
  listen();
});

onBeforeUnmount(() => {
  unlisten();
  close();
});
</script>

<template>
  <span ref="anchor">
    <AtomsWebInfoButton :title="definition.title" :expanded="open" @click="toggle" />
    <Teleport to="body">
      <div
        v-if="open"
        ref="tip"
        role="tooltip"
        class="fixed z-50 w-max max-w-[300px] rounded-2xl bg-web-raised px-4 py-3.5 font-manrope text-[13px] leading-[1.45] font-normal text-web-title shadow-[0_16px_40px_rgba(0,0,0,0.5)] inset-ring inset-ring-web-line"
        :class="position ? 'visible' : 'invisible'"
        :style="position ? { left: `${position.left}px`, top: `${position.top}px` } : undefined"
        @click.stop
      >
        <b class="mb-1 block text-[14px] leading-[1.3] font-semibold text-web-text">{{ definition.title }}</b>
        <p v-for="(paragraph, index) in definition.paragraphs" :key="index" class="m-0" :class="index > 0 ? 'mt-2.5' : ''">
          {{ paragraph }}
        </p>
        <div v-if="definition.how" class="mt-2.5 border-t border-web-line pt-2.5 text-[12px] text-web-grey">
          {{ definition.how }}
        </div>
      </div>
    </Teleport>
  </span>
</template>
