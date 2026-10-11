<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { useWebTooltip } from '~/composables/useWebTooltip';

/**
 * Подпись при наведении — короткая строка к значку или погашенной кнопке (issue #457). Один
 * компонент на весь веб вместо `title` браузера: тот появляется через секунду, выглядит
 * системным окном, не оформляется, а на телефоне его нет вовсе.
 *
 * Не путать с `Hint` (уточнение под полем) и `MetricInfo` (подсказка метрики по нажатию):
 * подпись — одна строка, редко две, и сама по себе ничего не открывает.
 *
 * Обёртка над одним элементом: что положили в слот — к тому и подпись. Значку без текста
 * `aria-label`, равный подписи, ставит тот, кто кладёт значок: подпись видна только открытой.
 *
 * Висит поверх страницы (`Teleport` в `body`, `position: fixed`) слоем выше подсказки метрики.
 * Внутри окна (`MoleculesWebDialog`) — в само окно: родной `<dialog>` браузер рисует в верхнем
 * слое, над любым `z-index` страницы, и подпись из `body` ушла бы под него. Встаёт над элементом
 * по центру; не влезает сверху — под ним; у края окна сдвигается внутрь с полем 12. Открыта одна
 * на страницу (`useWebTooltip`).
 *
 * Мышь — через 300 мс наведения, а сразу после погасшей соседней — без задержки; гаснет, как мышь
 * ушла. Фокус с клавиатуры — сразу, гаснет с фокусом и по Escape; в окне Escape гасит только
 * подпись, окно закрывает следующий. Касание делает своё действие
 * и подписи не показывает: подпись нужна погашенному элементу (`aria-disabled="true"`) — его
 * нажатие ничего не делает, а причину иначе не узнать. Ему — подпись на 3 с.
 */
const props = defineProps<{
  text: string;
}>();

/** Поле от края окна и зазор до элемента. */
const EDGE_GAP = 12;
const ANCHOR_GAP = 8;
const HOVER_DELAY_MS = 300;
/** Сколько держится подпись погашенного элемента после касания. */
const TOUCH_MS = 3_000;

const tipId = useId();
const { open, warm, show, hide } = useWebTooltip(tipId);

const anchor = ref<HTMLElement | null>(null);
const tip = ref<HTMLElement | null>(null);
/** Куда выносится подпись: в `body` или в окно, в котором стоит элемент. */
const layer = ref<HTMLElement | 'body'>('body');
/** `null` — ещё не поставлена: подпись не показывается в углу окна до первого расчёта. */
const position = ref<{ left: number; top: number; below: boolean } | null>(null);

/** Кто открыл: мышь гасит свою подпись уходом, фокус — своей потерей, и чужую не трогают. */
let openedBy: 'mouse' | 'focus' | 'touch' | null = null;
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let touchTimer: ReturnType<typeof setTimeout> | null = null;

const clearTimers = (): void => {
  if (hoverTimer) clearTimeout(hoverTimer);
  if (touchTimer) clearTimeout(touchTimer);
  hoverTimer = null;
  touchTimer = null;
};

/** Элемент из слота — к нему подпись и `aria-describedby`. */
const target = (): HTMLElement | null => {
  const element = anchor.value?.firstElementChild;

  return element instanceof HTMLElement ? element : null;
};

const openBy = (source: 'mouse' | 'focus' | 'touch'): void => {
  openedBy = source;
  layer.value = anchor.value?.closest('dialog') ?? 'body';
  show();
};

const place = (): void => {
  const element = target();

  if (!element || !tip.value) return;

  const box = element.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = tip.value;
  const left = Math.min(
    Math.max(EDGE_GAP, box.left + box.width / 2 - width / 2),
    window.innerWidth - width - EDGE_GAP,
  );
  const above = box.top - ANCHOR_GAP - height;
  const below = above < EDGE_GAP;

  position.value = { left, top: below ? box.bottom + ANCHOR_GAP : above, below };
};

const onPointerEnter = (event: PointerEvent): void => {
  if (event.pointerType !== 'mouse') return;

  if (hoverTimer) clearTimeout(hoverTimer);
  if (warm()) {
    openBy('mouse');
    return;
  }
  hoverTimer = setTimeout(() => openBy('mouse'), HOVER_DELAY_MS);
};

const onPointerLeave = (event: PointerEvent): void => {
  if (event.pointerType !== 'mouse') return;

  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = null;
  if (openedBy === 'mouse') hide();
};

const onPointerUp = (event: PointerEvent): void => {
  if (event.pointerType === 'mouse' || target()?.getAttribute('aria-disabled') !== 'true') return;

  openBy('touch');
  if (touchTimer) clearTimeout(touchTimer);
  touchTimer = setTimeout(hide, TOUCH_MS);
};

const onFocusIn = (event: FocusEvent): void => {
  if (event.target instanceof Element && event.target.matches(':focus-visible')) openBy('focus');
};

const onFocusOut = (): void => {
  if (openedBy === 'focus') hide();
};

const hideOnEscape = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape') return;

  // Без этого тот же Escape закрыл бы и окно, в котором стоит элемент.
  event.preventDefault();
  hide();
};

const listen = (): void => {
  document.addEventListener('keydown', hideOnEscape);
  // Захватом: прокручивается не только окно, но и любая колонка под элементом.
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
};

const unlisten = (): void => {
  document.removeEventListener('keydown', hideOnEscape);
  window.removeEventListener('scroll', place, true);
  window.removeEventListener('resize', place);
};

/** Ссылка на подпись дописывается к своим у элемента, а не заменяет их. */
const describe = (element: HTMLElement | null, described: boolean): void => {
  if (!element) return;

  const ids = (element.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id !== '' && id !== tipId);

  if (described) ids.push(tipId);
  if (ids.length > 0) element.setAttribute('aria-describedby', ids.join(' '));
  else element.removeAttribute('aria-describedby');
};

watch(open, async (isOpen) => {
  if (!isOpen) {
    // Закрыть могла и соседняя подпись, открывшись: таймеры этой больше ни к чему.
    openedBy = null;
    clearTimers();
    unlisten();
    describe(target(), false);
    position.value = null;
    return;
  }

  await nextTick();
  place();
  describe(target(), true);
  listen();
});

// Текст меняется на месте — «Скопировать ссылку» становится «Скопировано»: место пересчитывается
// под новую ширину.
watch(
  () => props.text,
  async () => {
    if (!open.value) return;

    await nextTick();
    place();
  },
);

onBeforeUnmount(() => {
  clearTimers();
  unlisten();
  hide();
});
</script>

<template>
  <span
    ref="anchor"
    class="inline-flex"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @pointerup="onPointerUp"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    <slot />
    <Teleport :to="layer">
      <div
        v-if="open"
        :id="tipId"
        ref="tip"
        role="tooltip"
        class="pointer-events-none fixed z-[60] w-max max-w-[240px] rounded-[10px] bg-web-raised px-2.5 py-[7px] font-manrope text-[12px] leading-[1.4] font-medium text-web-text shadow-[0_8px_24px_rgba(0,0,0,0.45)] inset-ring inset-ring-web-line"
        :class="position ? 'visible tooltip-shown' : 'invisible'"
        :style="
          position
            ? { left: `${position.left}px`, top: `${position.top}px`, '--tooltip-shift': position.below ? '-2px' : '2px' }
            : undefined
        "
      >
        {{ text }}
      </div>
    </Teleport>
  </span>
</template>

<style scoped>
/* Появление — прозрачность и сдвиг на 2 px от элемента. Анимация, а не переход: она начинается,
   когда подпись встала на место, и смена стороны при прокрутке её не перезапускает. */
.tooltip-shown {
  animation: tooltip-in 120ms ease-out;
}

@keyframes tooltip-in {
  from {
    opacity: 0;
    translate: 0 var(--tooltip-shift);
  }
}
</style>
