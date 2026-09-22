<script setup lang="ts">
/**
 * Низ экрана приглашения: вопрос, «Участвовать», согласие мелким и тихий отказ.
 *
 * Кнопка — гранатовая с золотым дыханием вокруг и бликом по ней: единственное главное
 * действие экрана, и оно липнет к низу при прокрутке. Отказ — подчёркнутой строкой:
 * путь есть, но с решением не спорит.
 *
 * Свечение кнопки накрывает всё, что идёт следом по потоку, поэтому согласию и отказу
 * поднят `z-index`.
 */
defineProps<{
  ask: string;
  accept: string;
  consent: string;
  decline: string;
}>();

defineEmits<{ accept: []; decline: [] }>();
</script>

<template>
  <div class="flex flex-col gap-[18px] text-center">
    <div class="promo-divider" aria-hidden="true" />
    <div class="promo-ask">{{ ask }}</div>
    <span class="promo-button-wrap">
      <button type="button" class="promo-button" @click="$emit('accept')">{{ accept }}</button>
    </span>
    <p class="promo-consent">{{ consent }}</p>
    <button type="button" class="promo-decline" @click="$emit('decline')">{{ decline }}</button>
  </div>
</template>

<style scoped>
.promo-divider {
  z-index: 1;
  width: 100%;
  max-width: 60%;
  height: 1px;
  margin: -10px auto 0;
  background: linear-gradient(90deg, rgba(247, 188, 62, 0) 0%, rgba(247, 188, 62, 0.25) 50%, rgba(247, 188, 62, 0) 100%);
}

.promo-ask {
  z-index: 1;
  margin: 0 0 5px;
  font-size: 13px;
  font-weight: 400;
  color: #8e97a5;
}

.promo-button-wrap {
  position: sticky;
  bottom: 16px;
  z-index: 3;
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

/* Основная кнопка L — 52, радиус 16, 15/700 (шкала шрифтов). */
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

.promo-consent {
  position: relative;
  z-index: 1;
  max-width: 300px;
  margin: 12px auto 0;
  font-size: 12px;
  font-weight: 300;
  line-height: 1.4;
  color: #626a77;
}

.promo-decline {
  position: relative;
  z-index: 1;
  align-self: center;
  margin-top: -4px;
  padding: 6px 8px;
  border: none;
  background: none;
  font-family: var(--font-manrope);
  font-size: 14px;
  font-weight: 400;
  color: #626a77;
  text-decoration: underline;
  text-decoration-color: rgba(98, 106, 119, 0.4);
  text-underline-offset: 3px;
  cursor: pointer;
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

@media (min-width: 361px) {
  .promo-ask {
    font-size: 14px;
  }
}

@media (min-width: 430px) {
  .promo-divider {
    margin: 5px auto 10px;
  }

  .promo-ask {
    margin-bottom: 15px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .promo-button-wrap::before,
  .promo-button::after {
    animation: none;
  }
}
</style>
