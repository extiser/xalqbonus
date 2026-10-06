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
 * Цель взята — фраза радуется, появляется «Открыть сундук» и два прохода конфетти
 * (`AtomsNextMemberConfetti`).
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
</script>

<template>
  <div class="relative flex flex-col items-center gap-4" :class="`goal-s${stage}`">
    <!-- Конфетти свисает над целью и по бокам: падать ему есть откуда -->
    <div v-if="complete" class="goal-confetti">
      <AtomsNextMemberConfetti />
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
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .goal-pip-next::after {
    animation: none;
  }
}
</style>
