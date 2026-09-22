<script setup lang="ts">
import { computed, ref, watch } from 'vue';

/**
 * Крупный сундук в своей шторке — трёх дней или недели, `product/design/comeback/05-*-chest-sheet.html`.
 *
 * Подложки нет: карточка с фоном делала из награды иконку в рамке. Позади — два слоя свечения:
 * широкий гранатовый даёт тепло, узкий золотой — блик на замке. Дышат с разной скоростью
 * и не в такт: совпадающая пульсация читается как мигание баннера.
 *
 * Подпись под сундуком стоит всегда и говорит, чего не хватает, — действием, а не ожиданием:
 * «Завершите ещё 1 день по 5 поездок».
 *
 * Тап по закрытому — отказ: сундук мотает головой вбок, свечение на миг краснеет, подпись
 * вспыхивает тем же. Движение разведено с приглашением: там покачивание вокруг дна, здесь
 * рывок вбок, — одно движение не может значить и «нажми», и «нельзя».
 *
 * Заработанный зовёт покачиванием и золотом. Тап по нему — разгон: сундук раздувается,
 * свет разгорается, бокс растёт под размер награды, подпись схлопывается. Конец разгона
 * отдаётся событием; `opened` подменяет приоткрытый распахнутым по ходу вылета.
 */
type ChestState = 'locked' | 'ready' | 'opened' | 'lost';

const props = defineProps<{
  kind: '3days' | 'week';
  state: ChestState;
  note: string;
  /** Ссылка в конце подписи — у открытого: «Мои награды и призы». */
  noteLink?: string;
  bursting: boolean;
  opened: boolean;
  /** Высота бокса к концу разгона — под карточку награды, в пикселях. */
  grownHeight?: number;
}>();

const emit = defineEmits<{ open: []; burst: []; link: [] }>();

const denied = ref(false);
const settling = ref(false);

watch(
  () => props.bursting,
  (bursting, wasBursting) => {
    settling.value = !bursting && wasBursting;
  },
);

const closedImage = computed(() => {
  if (props.state === 'ready') {
    return `/design/chest-${props.kind}-ajar.png`;
  }

  return props.state === 'opened' ? `/design/chest-${props.kind}-open.png` : `/design/chest-${props.kind}.png`;
});

const openImage = computed(() => `/design/chest-${props.kind}-open.png`);

const boxHeight = computed(() => {
  if (props.bursting && props.grownHeight) {
    return `${props.grownHeight}px`;
  }

  return props.state === 'lost' ? '200px' : '244px';
});

function onTap(): void {
  if (props.state === 'ready' && !props.bursting) {
    emit('open');

    return;
  }

  // Окна больше нет — отказывать нечему, тап молчит.
  if (props.state === 'locked') {
    denied.value = true;
  }
}

// События анимаций всплывают от всех слоёв бокса; решает только сама картинка сундука —
// у свечения свои анимации с похожими именами.
function onAnimationEnd(event: AnimationEvent): void {
  if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute('data-big-chest-image')) {
    return;
  }

  if (event.animationName.startsWith('big-chest-deny')) {
    denied.value = false;
  }

  if (event.animationName.startsWith('big-chest-burst')) {
    emit('burst');
  }
}
</script>

<template>
  <div class="flex flex-col">
    <button
      type="button"
      class="big-chest"
      :class="[
        `big-chest-${state}`,
        denied ? 'big-chest-denied' : '',
        bursting ? 'big-chest-bursting' : '',
        opened ? 'big-chest-revealed' : '',
        settling ? 'big-chest-settling' : '',
      ]"
      :style="{ height: boxHeight }"
      :aria-label="note"
      @click="onTap"
      @animationend="onAnimationEnd"
    >
      <span class="big-chest-glow big-chest-glow-wide" />
      <span class="big-chest-glow big-chest-glow-core" />
      <img class="big-chest-shot" data-big-chest-image :src="closedImage" alt="">
      <img v-if="state === 'ready'" class="big-chest-shot big-chest-shot-open" :src="openImage" alt="">
    </button>

    <div class="big-chest-note-wrap" :class="bursting ? 'big-chest-note-collapsed' : ''">
      <p class="big-chest-note" :class="[`big-chest-note-${state}`, denied ? 'big-chest-note-denied' : '']">
        {{ note }}
        <button v-if="noteLink" type="button" class="big-chest-link" @click="$emit('link')">{{ noteLink }}</button>
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Бокс сундука. Высота в покое 244, у упущенного 200; при разгоне растёт под карточку
   награды теми же 0.9 с — шторка поднимается ровно настолько, насколько вырос сундук. */
.big-chest {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 0 26px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: height 0.9s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

.big-chest-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(18px);
  pointer-events: none;
}

.big-chest-glow-wide {
  width: 284px;
  height: 284px;
  background: radial-gradient(circle, rgba(232, 54, 93, 0.3) 0%, rgba(232, 54, 93, 0.12) 45%, rgba(232, 54, 93, 0) 70%);
  animation: big-chest-breathe-wide 6.5s ease-in-out infinite;
}

.big-chest-glow-core {
  width: 220px;
  height: 220px;
  background: radial-gradient(circle, rgba(247, 188, 62, 0.34) 0%, rgba(247, 188, 62, 0.14) 50%, rgba(247, 188, 62, 0) 72%);
  animation: big-chest-breathe-core 4.2s ease-in-out infinite;
}

/* Только прямой потомок: правила сундука не должны трогать другие картинки внутри. */
.big-chest > .big-chest-shot {
  position: relative;
  display: block;
  width: 182px;
  height: 182px;
  filter: drop-shadow(0 0 32px rgba(247, 188, 62, 0.28));
}

/* Распахнутый лежит поверх приоткрытого и проявляется по ходу вылета — переходом,
   а не анимацией: свойство animation у картинок занято разгоном. */
.big-chest > .big-chest-shot-open {
  position: absolute;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.big-chest-revealed > .big-chest-shot-open {
  opacity: 1;
}

.big-chest-revealed > .big-chest-shot:not(.big-chest-shot-open) {
  opacity: 0;
}

.big-chest-ready > .big-chest-glow-core {
  background: radial-gradient(circle, rgba(247, 188, 62, 0.5) 0%, rgba(247, 188, 62, 0.2) 50%, rgba(247, 188, 62, 0) 72%);
}

.big-chest-ready > .big-chest-shot {
  transform-origin: 50% 88%;
  animation: big-chest-nudge 3.4s ease-in-out infinite;
}

.big-chest-opened > .big-chest-glow {
  animation: none;
}

.big-chest-lost > .big-chest-glow {
  display: none;
}

.big-chest-lost > .big-chest-shot {
  filter: grayscale(0.75);
  opacity: 0.5;
}

.big-chest-denied > .big-chest-shot {
  animation: big-chest-deny 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

.big-chest-denied > .big-chest-glow-core {
  animation: big-chest-deny-glow 0.5s ease-out;
}

.big-chest-bursting > .big-chest-shot {
  animation: big-chest-burst 0.9s cubic-bezier(0.36, 0.07, 0.19, 0.97) forwards;
}

.big-chest-bursting > .big-chest-glow {
  animation: big-chest-burst-glow 0.9s ease-in forwards;
}

/* У разгона forwards — снятый, он оседает второй анимацией, а не рывком. */
.big-chest-settling > .big-chest-shot {
  animation: big-chest-settle 0.32s ease-out;
}

.big-chest-note-wrap {
  display: grid;
  grid-template-rows: 1fr;
  transition:
    grid-template-rows 0.9s cubic-bezier(0.36, 0.07, 0.19, 0.97),
    opacity 0.9s ease;
}

.big-chest-note-collapsed {
  grid-template-rows: 0fr;
  opacity: 0;
}

/* Подпись под сундуком — 14/600 серым, у готового золотом (шкала шрифтов). */
.big-chest-note {
  min-height: 0;
  margin: 2px 0 0;
  overflow: hidden;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.65;
  color: #a9b2bf;
}

.big-chest-note-ready {
  color: #f7bc3e;
}

.big-chest-note-opened {
  font-weight: 400;
  color: #8a93a2;
}

.big-chest-note-lost {
  font-weight: 400;
  color: #4e545e;
}

.big-chest-note-denied {
  animation: big-chest-deny-note 0.5s ease-out;
}

.big-chest-link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  white-space: nowrap;
  color: #e8365d;
  text-decoration: underline;
  text-decoration-color: rgba(232, 54, 93, 0.5);
  text-underline-offset: 3px;
  cursor: pointer;
}

@keyframes big-chest-breathe-wide {
  0%,
  100% { transform: scale(0.94); opacity: 0.65; }
  50% { transform: scale(1.06); opacity: 1; }
}

@keyframes big-chest-breathe-core {
  0%,
  100% { transform: scale(1); opacity: 0.75; }
  50% { transform: scale(1.1); opacity: 1; }
}

@keyframes big-chest-nudge {
  0%,
  34%,
  100% { transform: rotate(0deg); }
  4% { transform: rotate(-4.5deg); }
  9% { transform: rotate(3.8deg); }
  14% { transform: rotate(-2.8deg); }
  19% { transform: rotate(1.9deg); }
  24% { transform: rotate(-1.1deg); }
}

@keyframes big-chest-deny {
  0%,
  100% { transform: translateX(0); }
  12% { transform: translateX(-7px) rotate(-1.5deg); }
  30% { transform: translateX(6px) rotate(1.2deg); }
  48% { transform: translateX(-4px) rotate(-0.8deg); }
  66% { transform: translateX(3px) rotate(0.5deg); }
  84% { transform: translateX(-1.5px); }
}

@keyframes big-chest-deny-glow {
  0%,
  100% { background: radial-gradient(circle, rgba(247, 188, 62, 0.34) 0%, rgba(247, 188, 62, 0.14) 50%, rgba(247, 188, 62, 0) 72%); }
  25%,
  60% {
    background: radial-gradient(circle, rgba(232, 54, 93, 0.42) 0%, rgba(232, 54, 93, 0.18) 50%, rgba(232, 54, 93, 0) 72%);
    transform: scale(1.04);
  }
}

@keyframes big-chest-deny-note {
  0%,
  100% { color: #a9b2bf; }
  25%,
  60% { color: #e8365d; }
}

@keyframes big-chest-burst {
  0% { transform: scale(1) rotate(0deg); }
  15% { transform: scale(1.02) rotate(-3deg); }
  28% { transform: scale(1.04) rotate(3deg); }
  40% { transform: scale(1.06) rotate(-4deg); }
  52% { transform: scale(1.08) rotate(4deg); }
  62% { transform: scale(1.1) rotate(-5deg); }
  72% { transform: scale(1.12) rotate(5deg); }
  82% { transform: scale(1.14) rotate(-4deg); }
  90% { transform: scale(1.16) rotate(3deg); }
  100% { transform: scale(1.2) rotate(0deg); }
}

@keyframes big-chest-burst-glow {
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(1.5); opacity: 1; }
}

@keyframes big-chest-settle {
  0% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

/* Без движения нет ни дыхания, ни отказа; разгон проходит мгновенно, чтобы его конец
   всё равно пришёл событием и награда вылетела. */
@media (prefers-reduced-motion: reduce) {
  .big-chest,
  .big-chest-note-wrap {
    transition: none;
  }

  .big-chest-glow,
  .big-chest-ready > .big-chest-shot,
  .big-chest-denied > .big-chest-shot,
  .big-chest-denied > .big-chest-glow-core,
  .big-chest-note-denied,
  .big-chest-settling > .big-chest-shot,
  .big-chest-bursting > .big-chest-glow {
    animation: none;
  }

  .big-chest-bursting > .big-chest-shot {
    animation: big-chest-burst 0.01s linear forwards;
  }
}
</style>
