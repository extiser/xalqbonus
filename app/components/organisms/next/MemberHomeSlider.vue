<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

/**
 * Слайдер центра главной — `_reference/design/home/main-screen-welcome.html`, «СЛАЙДЕР ЦЕНТРА»
 * и «ПОДСКАЗКА СВАЙПА» (issue #410). Слайды — дети слота, по одному на обещание водителю.
 *
 * Над слайдами точки, стоят на месте; нажатие на точку листает. Свайп пальцем или мышью: порог —
 * 18 % ширины, иначе возврат. Направление жеста решается по первым 6 px, и вертикальную прокрутку
 * страницы слайдер не перехватывает (`touch-action: pan-y`).
 *
 * Окно — `overflow: clip`, а не `auto` и не `hidden`: контейнер прокрутки здесь сломал бы
 * признак `covered` у крупного числа, от которого зависят подложка и пилюля баланса в шапке.
 *
 * Подсказка свайпа играет при каждом показе главной, отметки «видел» нет ни в базе, ни в браузере:
 * над точками уезжают две стрелки, центр дважды подаётся влево. Гаснет сама через 4,3 с, сразу —
 * на первом касании окна и на любой смене слайда (точка, пилюля в шапке).
 *
 * Без подсказки (`hint`) — ни стрелок, ни подачи центра: на слайде «Ура! Бонус зачислен!» внимание
 * на празднике и «Спасибо» (`main-screen-welcome-awarded.html`, issue #421). Листать свайпом
 * и точками можно и тогда. Подсказка снята на ходу — гаснет сразу.
 */
const props = defineProps<{
  /** Сколько слайдов в слоте. */
  count: number;
  /** Подписи точек для экранного чтеца, по слайду. */
  labels: string[];
  /** Играть подсказку свайпа при показе. */
  hint: boolean;
}>();

/** Номер показанного слайда, с нуля. Держит владелец: пилюля в шапке листает тот же слайдер. */
const index = defineModel<number>('index', { required: true });

/** Доля ширины, после которой отпущенный палец листает, а не возвращает слайд. */
const SWIPE_THRESHOLD = 0.18;

/** Сколько пикселей движения решают, свайп это или прокрутка страницы. */
const DIRECTION_SLOP = 6;

/** Сколько живёт подсказка: три повтора стрелок по 1,4 с и хвост угасания. */
const HINT_DURATION_MS = 4300;

const viewport = useTemplateRef<HTMLElement>('viewport');

const hinting = ref(props.hint);
const dragOffset = ref(0);
const dragging = ref(false);

let startX: number | null = null;
let startY = 0;
let horizontal: boolean | null = null;
let hintTimer: ReturnType<typeof setTimeout> | undefined;

const hideHint = (): void => {
  hinting.value = false;
  clearTimeout(hintTimer);
};

const go = (next: number): void => {
  index.value = Math.max(0, Math.min(props.count - 1, next));
};

// Слайд сменился откуда угодно — точкой, свайпом или пилюлей шапки: подсказка гаснет.
// Подача центра держит `transform` анимацией и иначе не дала бы слайду уехать.
watch(index, hideHint);

// Счёт перешёл в праздник при открытой главной: подсказка гаснет, не доиграв.
watch(
  () => props.hint,
  (hint) => {
    if (!hint) hideHint();
  },
);

/**
 * Палец отпустил слайд после горизонтального жеста — нажатие, которое браузер следом
 * отдаст кнопке под пальцем («Обменять баллы»), гасится: это был свайп, а не нажатие.
 */
let suppressClick = false;

const onClickCapture = (event: MouseEvent): void => {
  if (!suppressClick) return;

  suppressClick = false;
  event.preventDefault();
  event.stopPropagation();
};

const onPointerMove = (event: PointerEvent): void => {
  if (startX === null) return;

  const moveX = event.clientX - startX;
  const moveY = event.clientY - startY;

  if (horizontal === null && (Math.abs(moveX) > DIRECTION_SLOP || Math.abs(moveY) > DIRECTION_SLOP)) {
    horizontal = Math.abs(moveX) > Math.abs(moveY);
  }

  if (!horizontal) return;

  dragging.value = true;
  dragOffset.value = moveX;
};

const stopTracking = (): void => {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerCancel);
  startX = null;
  dragging.value = false;
  dragOffset.value = 0;
};

function onPointerUp(): void {
  const width = viewport.value?.getBoundingClientRect().width ?? 0;
  const offset = dragOffset.value;

  if (horizontal) {
    suppressClick = true;
    // Нажатия может и не быть — тогда отметка не должна дожить до следующего настоящего.
    setTimeout(() => (suppressClick = false), 0);
  }

  if (horizontal && Math.abs(offset) > width * SWIPE_THRESHOLD) {
    go(index.value + (offset < 0 ? 1 : -1));
  }

  stopTracking();
}

// Браузер забрал жест себе — вертикальная прокрутка страницы: слайд возвращается на место.
function onPointerCancel(): void {
  stopTracking();
}

const onPointerDown = (event: PointerEvent): void => {
  hideHint();
  startX = event.clientX;
  startY = event.clientY;
  horizontal = null;
  dragOffset.value = 0;
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
};

onMounted(() => {
  if (hinting.value) {
    hintTimer = setTimeout(hideHint, HINT_DURATION_MS);
  }
});

onBeforeUnmount(() => {
  clearTimeout(hintTimer);
  stopTracking();
});
</script>

<template>
  <div class="slider">
    <span class="slider-hint" :class="hinting ? '' : 'slider-hint-gone'" aria-hidden="true">
      <svg v-for="arrow in 2" :key="arrow" viewBox="0 0 24 24" width="14" height="14" fill="none">
        <path d="M14.5 5.5L8 12l6.5 6.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <span class="slider-dots">
      <button
        v-for="(label, dotIndex) in labels"
        :key="dotIndex"
        type="button"
        class="slider-dot"
        :class="dotIndex === index ? 'slider-dot-on' : ''"
        :aria-label="label"
        :aria-current="dotIndex === index"
        @click="go(dotIndex)"
      />
    </span>
    <div ref="viewport" class="slider-viewport" @pointerdown="onPointerDown" @click.capture="onClickCapture">
      <div
        class="slider-track"
        :class="{ 'slider-track-dragging': dragging, 'slider-track-nudge': hinting }"
        :style="{ transform: `translateX(calc(${-index * 100}% + ${dragOffset}px))` }"
      >
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.slider {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.slider-hint {
  position: absolute;
  top: -22px;
  left: 50%;
  display: flex;
  gap: 1px;
  color: rgba(244, 246, 248, 0.7);
  pointer-events: none;
  transform: translateX(-50%);
  transition: opacity 0.4s ease-out;
}

.slider-hint svg {
  animation: slider-hint-left 1.4s ease-in-out 3 both;
}

.slider-hint svg + svg {
  animation-delay: 0.12s;
}

.slider-hint-gone {
  opacity: 0;
}

@keyframes slider-hint-left {
  0% {
    transform: translateX(10px);
    opacity: 0;
  }

  35% {
    opacity: 1;
  }

  100% {
    transform: translateX(-12px);
    opacity: 0;
  }
}

.slider-dots {
  display: flex;
  gap: 6px;
  height: 6px;
}

/* Точка — кнопка 6×6; область нажатия шире самой точки, раскладку она не трогает. */
.slider-dot {
  position: relative;
  width: 6px;
  height: 6px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.28);
  cursor: pointer;
  transition: width 0.2s ease-out, background-color 0.2s ease-out;
}

.slider-dot::after {
  content: '';
  position: absolute;
  inset: -10px -4px;
}

.slider-dot-on {
  width: 18px;
  background: #f4f6f8;
}

.slider-viewport {
  width: 100%;
  overflow: clip;
  touch-action: pan-y;
}

.slider-track {
  display: flex;
  transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
}

.slider-track-dragging {
  transition: none;
}

.slider-track-nudge {
  animation: slider-track-nudge 1.4s ease-in-out 0.3s 2;
}

@keyframes slider-track-nudge {
  0%,
  100% {
    transform: translateX(0);
  }

  40% {
    transform: translateX(-28px);
  }
}

/* Слайд — во всю ширину окна; выделение текста при протяжке мышью не нужно. */
:slotted(*) {
  flex: 0 0 100%;
  min-width: 0;
  user-select: none;
  -webkit-user-select: none;
}

@media (prefers-reduced-motion: reduce) {
  .slider-hint svg,
  .slider-track-nudge {
    animation: none;
  }

  .slider-track,
  .slider-dot {
    transition: none;
  }
}
</style>
