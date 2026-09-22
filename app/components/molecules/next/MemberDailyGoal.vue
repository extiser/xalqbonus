<script setup lang="ts">
import { computed } from 'vue';
import type { MemberHeatStage } from '~/types/memberView';

/**
 * Дневная цель акции в центре экрана участника: «Сегодня 3 / 5 поездок», шкала на пять
 * делений и фраза, сколько осталось до сундука дня.
 *
 * Цвет шкалы — от ступени накала, той же, что греет фон: холодный синий, гранат, огонь.
 * Следующее деление дышит — туда ляжет следующая поездка.
 *
 * Цель взята — фраза радуется, появляется «Открыть сундук» и два прохода конфетти.
 * Праздник должен кончиться: экран водитель держит всю смену, и бесконечный салют
 * через минуту раздражает.
 */
const props = defineProps<{
  done: number;
  target: number;
  stage: MemberHeatStage;
  texts: {
    today: string;
    unit: string;
    note: string;
    /** Подпись кнопки открытия. Нет — кнопки нет: цель ещё не взята. */
    take?: string;
  };
}>();

defineEmits<{ take: [] }>();

const complete = computed(() => props.done >= props.target);

/** Конфетти раскладывается по порядку, а не случайно: сервер и браузер должны нарисовать одно. */
const CONFETTI_COLORS = ['#E8365D', '#F7BC3E', '#FAA02C', '#F4F6F8'] as const;
const CONFETTI = Array.from({ length: 24 }, (_, index) => ({
  left: `${(index * 4.1 + 2.7) % 100}%`,
  background: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  animationDelay: `${((index * 37) % 90) / 100}s`,
  animationDuration: `${2.3 + ((index * 53) % 70) / 100}s`,
  small: index % 3 === 0,
}));
</script>

<template>
  <div class="relative flex flex-col items-center gap-4" :class="`goal-s${stage}`">
    <div v-if="complete" class="goal-confetti" aria-hidden="true">
      <i
        v-for="(piece, index) in CONFETTI"
        :key="index"
        :class="piece.small ? 'goal-confetti-small' : ''"
        :style="{
          left: piece.left,
          background: piece.background,
          animationDelay: piece.animationDelay,
          animationDuration: piece.animationDuration,
        }"
      />
    </div>

    <div class="flex flex-col items-center gap-2.5">
      <AtomsNextMemberEyebrow :label="texts.today" />
      <div class="flex items-center gap-3 font-unbounded text-[62px] leading-none tracking-[-3px] tabular-nums">
        <span class="font-bold" :class="done === 0 ? 'text-[rgba(244,246,248,0.34)]' : 'text-xb-text'">{{ done }}</span>
        <span class="font-extralight tracking-normal text-[rgba(244,246,248,0.28)]">/</span>
        <span class="font-bold text-xb-text">{{ target }}</span>
      </div>
      <span class="text-[12px] font-extralight tracking-[0.2px] text-xb-secondary">{{ texts.unit }}</span>
    </div>

    <div class="flex gap-1.5" aria-hidden="true">
      <span
        v-for="pip in target"
        :key="pip"
        class="goal-pip"
        :class="{ 'goal-pip-on': pip <= done, 'goal-pip-next': pip === done + 1 }"
      />
    </div>

    <div class="text-center text-[16px] font-bold leading-[1.3] text-white">{{ texts.note }}</div>

    <div v-if="complete && texts.take" class="mt-2">
      <AtomsNextMemberButton size="s" tone="gold" @click="$emit('take')">{{ texts.take }}</AtomsNextMemberButton>
    </div>
  </div>
</template>

<style scoped>
.goal-s1 { --pip: #7e92d8; }
.goal-s2 { --pip: #e8365d; }
.goal-s3 { --pip: #faa02c; }

.goal-pip {
  position: relative;
  width: 26px;
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.13);
  transition: background 0.5s ease;
}

.goal-pip-on {
  background: var(--pip);
}

.goal-pip::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--pip);
  opacity: 0;
}

.goal-pip-next::after {
  animation: goal-pip-breath 1.8s ease-in-out infinite;
}

@keyframes goal-pip-breath {
  0%,
  100% { opacity: 0; box-shadow: 0 0 0 rgba(0, 0, 0, 0); }
  50% { opacity: 0.62; box-shadow: 0 0 10px -2px var(--pip); }
}

.goal-confetti {
  position: absolute;
  inset: -40px -20px 0;
  z-index: 2;
  overflow: hidden;
  pointer-events: none;
}

.goal-confetti i {
  position: absolute;
  top: -16px;
  width: 7px;
  height: 11px;
  border-radius: 1px;
  opacity: 0;
  animation: goal-fall 2.6s ease-in 2 forwards;
}

.goal-confetti i.goal-confetti-small {
  width: 5px;
  height: 9px;
}

@keyframes goal-fall {
  0% { opacity: 0; transform: translateY(-20px) rotate(0deg); }
  8% { opacity: 1; }
  78% { opacity: 1; }
  100% { opacity: 0; transform: translateY(300px) rotate(540deg); }
}

@media (prefers-reduced-motion: reduce) {
  .goal-pip-next::after {
    animation: none;
  }

  .goal-confetti {
    display: none;
  }
}
</style>
