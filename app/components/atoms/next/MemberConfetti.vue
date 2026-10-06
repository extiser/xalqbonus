<script setup lang="ts">
/**
 * Конфетти праздника: взятая цель дня акции (`MemberDailyGoal`) и выданный приветственный бонус
 * на главной (`_reference/design/home/main-screen-welcome-awarded.html`, `.top .confetti`, issue #421).
 *
 * Частицы падают сверху два прохода и замирают: экран водитель держит всю смену, и бесконечный
 * салют через минуту раздражает. Играет при появлении — показать праздник ещё раз значит
 * смонтировать атом заново.
 *
 * Атом заполняет свой содержащий блок и режет частицы по нему; где этот блок, решает владелец.
 * При «уменьшить движение» конфетти нет.
 */

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
  <div class="confetti" aria-hidden="true">
    <i
      v-for="(piece, index) in CONFETTI"
      :key="index"
      :class="piece.small ? 'confetti-small' : ''"
      :style="{
        left: piece.left,
        background: piece.background,
        animationDelay: piece.animationDelay,
        animationDuration: piece.animationDuration,
      }"
    />
  </div>
</template>

<style scoped>
.confetti {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.confetti i {
  position: absolute;
  top: -16px;
  width: 7px;
  height: 11px;
  border-radius: 1px;
  opacity: 0;
  animation: confetti-fall 2.6s ease-in 2 forwards;
}

.confetti i.confetti-small {
  width: 5px;
  height: 9px;
}

@keyframes confetti-fall {
  0% { opacity: 0; transform: translateY(-20px) rotate(0deg); }
  8% { opacity: 1; }
  78% { opacity: 1; }
  100% { opacity: 0; transform: translateY(300px) rotate(540deg); }
}

@media (prefers-reduced-motion: reduce) {
  .confetti {
    display: none;
  }
}
</style>
