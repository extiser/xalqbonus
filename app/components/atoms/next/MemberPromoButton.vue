<script setup lang="ts">
/**
 * «Участвовать» на экране приглашения — `product/design/comeback/02-promo-hero.html`.
 *
 * Основная кнопка L по шкале (52, радиус 16, 15/700), но в своём виде: гранатовый градиент,
 * золотое дыхание вокруг и бегущий блик. Единственное главное действие экрана, и такого
 * вида у гранатовой L больше нигде нет — поэтому отдельно от `MemberButton`.
 *
 * Свечение живёт на обёртке, а не на кнопке: кнопка режет содержимое по краям ради блика.
 * Где кнопка стоит и липнет ли к низу, решает контейнер.
 */
defineEmits<{ click: [] }>();
</script>

<template>
  <span class="promo-button-wrap">
    <button type="button" class="promo-button" @click="$emit('click')">
      <slot />
    </button>
  </span>
</template>

<style scoped>
.promo-button-wrap {
  position: relative;
  display: block;
}

/* Золотое свечение вокруг дышит — анимируются только прозрачность и масштаб. */
.promo-button-wrap::before {
  content: '';
  position: absolute;
  inset: -10px;
  border-radius: 26px;
  background: radial-gradient(60% 120% at 50% 50%, rgba(247, 188, 62, 0.75) 0%, rgba(206, 112, 30, 0.35) 45%, rgba(247, 188, 62, 0) 72%);
  filter: blur(14px);
  animation: promo-glow 3.6s ease-in-out infinite;
  will-change: opacity, transform;
}

.promo-button {
  position: relative;
  overflow: hidden;
  display: block;
  width: 100%;
  height: 52px;
  padding: 0 20px;
  border: none;
  border-radius: 16px;
  background: linear-gradient(180deg, #f2496e 0%, #e8365d 55%, #d42a50 100%);
  color: #fff;
  font-family: var(--font-manrope);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.2px;
  cursor: pointer;
}

.promo-button::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -60%;
  width: 45%;
  background: linear-gradient(105deg, rgba(255, 231, 168, 0) 0%, rgba(255, 231, 168, 0.55) 50%, rgba(255, 231, 168, 0) 100%);
  animation: promo-shine 3.6s ease-in-out infinite;
  pointer-events: none;
}

@keyframes promo-glow {
  0% { opacity: 0.55; transform: scale(0.98); }
  50% { opacity: 1; transform: scale(1.04); }
  100% { opacity: 0.55; transform: scale(0.98); }
}

@keyframes promo-shine {
  0% { transform: translateX(0); }
  55% { transform: translateX(370%); }
  100% { transform: translateX(370%); }
}

@media (prefers-reduced-motion: reduce) {
  .promo-button-wrap::before,
  .promo-button::after {
    animation: none;
  }
}
</style>
