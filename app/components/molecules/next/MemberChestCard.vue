<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { MemberChestCardView } from '~/types/memberView';

/**
 * Карточка дня в шторке «Сундуки дня» — `product/design/comeback/04-chest-cards-states.html`.
 *
 * Колонка из трёх строк: ярлык, сундук, подпись. Ярлык есть у каждой — где сказать нечего,
 * он пустой и держит высоту: иначе сундук с надписью садился бы ниже соседних.
 *
 * Пять состояний. Впереди и упущен гаснут одинаково, разницу несёт ярлык «3 из 5»; убрать
 * день нельзя — пропавший день читается как обман. Сегодняшний — рубиновой рамкой и стаканом
 * взятых поездок. К открытию — золото, и только этот сундук двигается: тряска короткая
 * и затухающая, с паузой — непрерывное качание превращается в фон и перестаёт звать.
 * Открытый — отработанный, чуть светлее погашенных: «был ваш», а не «не ваш».
 *
 * `bursting` — разгон перед вылетом награды: тряска учащается, сундук раздувается и остаётся
 * раздутым. Конец разгона отдаётся событием — по нему вылетает награда.
 *
 * `opened` — награда вылетела, сундук в разгоне подменяется распахнутым тем же кадром.
 * У разгона `forwards`, поэтому когда он снят, раздутый сундук оседает второй анимацией,
 * а не возвращается к своему размеру рывком.
 */
const props = defineProps<{
  card: MemberChestCardView;
  bursting?: boolean;
  opened?: boolean;
}>();

const emit = defineEmits<{ open: []; burst: [] }>();

const settling = ref(false);

watch(
  () => props.bursting,
  (bursting, wasBursting) => {
    settling.value = !bursting && Boolean(wasBursting);
  },
);

const image = computed(() => {
  if (props.card.state === 'open' || props.opened) {
    return '/design/chest-day-open.png';
  }

  return props.card.state === 'hot' ? '/design/chest-day-ajar.png' : '/design/chest-day.png';
});

function onAnimationEnd(event: AnimationEvent): void {
  if (event.animationName.startsWith('chest-card-burst')) {
    emit('burst');
  }
}
</script>

<template>
  <component
    :is="card.state === 'hot' ? 'button' : 'div'"
    :type="card.state === 'hot' ? 'button' : undefined"
    class="chest-card"
    :class="[`chest-card-${card.state}`, bursting ? 'chest-card-bursting' : '', settling ? 'chest-card-settling' : '']"
    @click="card.state === 'hot' && !bursting ? $emit('open') : undefined"
  >
    <span v-if="card.state === 'today'" class="chest-card-fill" :style="{ height: `${(card.fill ?? 0) * 100}%` }" />
    <span class="chest-card-tag">{{ card.tag }}</span>
    <img class="chest-card-image" :src="image" alt="" @animationend="onAnimationEnd">
    <span class="chest-card-label">{{ card.label }}</span>
  </component>
</template>

<style scoped>
.chest-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  box-sizing: border-box;
  width: 100%;
  aspect-ratio: 1;
  padding: 8px 6px 14px;
  overflow: hidden;
  border: 0;
  border-radius: 18px;
  background: #1a1e26;
  font-family: var(--font-manrope);
  text-align: center;
}

.chest-card > * {
  position: relative;
  z-index: 1;
}

.chest-card .chest-card-fill {
  position: absolute;
  inset: auto 0 0;
  z-index: 0;
  background: linear-gradient(180deg, rgba(232, 54, 93, 0.34) 0%, rgba(232, 54, 93, 0.16) 100%);
  pointer-events: none;
}

.chest-card-image {
  display: block;
  width: 54px;
  height: 54px;
}

.chest-card-tag,
.chest-card-label {
  min-height: 12px;
  font-size: 10px;
  font-weight: 400;
  line-height: 1.2;
}

.chest-card-tag {
  letter-spacing: 0.3px;
  color: #4e545e;
}

.chest-card-label {
  color: #8a93a2;
}

.chest-card-cold,
.chest-card-lost {
  background: #12151b;
}

.chest-card-cold {
  padding-bottom: 22px;
}

.chest-card-cold > .chest-card-image,
.chest-card-lost > .chest-card-image {
  filter: grayscale(0.75);
  opacity: 0.5;
}

.chest-card-cold > .chest-card-label,
.chest-card-lost > .chest-card-label {
  color: #4e545e;
}

.chest-card-today {
  padding-bottom: 13px;
  box-shadow: 0 0 0 1px rgba(232, 54, 93, 0.55) inset;
}

.chest-card-today > .chest-card-image {
  top: -3px;
}

.chest-card-today > .chest-card-tag,
.chest-card-today > .chest-card-label {
  font-weight: 600;
  color: #c2c9d3;
}

.chest-card-hot {
  padding-bottom: 18px;
  cursor: pointer;
  background: linear-gradient(135deg, rgba(247, 188, 62, 0.16) 0%, rgba(247, 188, 62, 0.05) 70%, rgba(247, 188, 62, 0) 100%);
  box-shadow: 0 0 0 1px rgba(247, 188, 62, 0.42) inset;
}

/* Мелкая подпись: спокойная 400, загоревшаяся 600 — кегль не меняется, состояние несёт цвет. */
.chest-card-hot > .chest-card-label {
  font-weight: 600;
  color: #f7bc3e;
}

/* Сундук стоит на полу и потряхивается вокруг нижней кромки — низ с места не уходит. */
.chest-card-hot > .chest-card-image {
  top: -5px;
  transform-origin: 50% 88%;
  animation: chest-card-shake 3.4s ease-in-out infinite;
}

.chest-card-open {
  padding-bottom: 18px;
  background: #1f252f;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12) inset;
}

.chest-card-open > .chest-card-image {
  filter: grayscale(0.12);
  opacity: 0.94;
}

.chest-card-open > .chest-card-label {
  color: #626a77;
}

/* Разгон: поверх соседей и без обрезки — иначе рамка карточки срезала бы раздутому сундуку
   углы. Селектор через прямого потомка: разгон перебивает приглашающую тряску. */
.chest-card-bursting {
  z-index: 2;
  overflow: visible;
}

.chest-card-hot.chest-card-bursting > .chest-card-image {
  animation: chest-card-burst 0.9s cubic-bezier(0.36, 0.07, 0.19, 0.97) forwards;
}

.chest-card-settling > .chest-card-image {
  animation: chest-card-settle 0.32s ease-out;
}

@keyframes chest-card-settle {
  0% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

@keyframes chest-card-shake {
  0% { transform: rotate(0deg); }
  4% { transform: rotate(-4.5deg); }
  9% { transform: rotate(3.8deg); }
  14% { transform: rotate(-2.8deg); }
  19% { transform: rotate(1.9deg); }
  24% { transform: rotate(-1.1deg); }
  29% { transform: rotate(0.5deg); }
  34%,
  100% { transform: rotate(0deg); }
}

@keyframes chest-card-burst {
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

@media (min-width: 400px) {
  .chest-card-image {
    width: 66px;
    height: 66px;
    top: -4px;
  }

  .chest-card-hot > .chest-card-image {
    top: -6px;
  }

  .chest-card-tag,
  .chest-card-label {
    min-height: 13px;
    font-size: 11px;
  }
}

/* Без движения разгона нет — и конца его тоже: событие отдаётся сразу. */
@media (prefers-reduced-motion: reduce) {
  .chest-card-hot > .chest-card-image {
    animation: none;
  }

  .chest-card-hot.chest-card-bursting > .chest-card-image {
    animation: chest-card-burst 0.01s linear forwards;
  }
}
</style>
