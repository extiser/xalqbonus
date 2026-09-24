<script setup lang="ts">
/**
 * Живой фон под балансом главного экрана, под экраном приглашения и под регистрацией — `_reference/design/motion.md`.
 *
 * Неподвижное ядро и три подвижных пятна: гранат, вино и янтарь. Периоды 13, 17 и 23 секунды
 * взаимно простые — слои не сходятся в одну фазу, и картинка не «дышит в такт». Без
 * неподвижного ядра экран проваливался в чёрный, когда подвижные пятна расходились по краям.
 *
 * Анимируются только `transform` и `opacity`, размытие задано раз: слой едет готовой
 * текстурой на видеокарте и не греет процессор дешёвого телефона.
 *
 * Лежит под содержимым целиком, растягиваясь на родителя: место и `overflow: hidden`
 * задаёт контейнер.
 *
 * `home` — под балансом главной. `promo` — экран приглашения (`comeback/02-promo-hero.html`):
 * пятна те же и дрейфуют так же, но стоят выше и ниже ростом, а затемнение начинается раньше
 * (с 44 % вместо 52 %) — как в макете.
 *
 * `registration` — экраны регистрации, заглушки и загрузка (`registration/*.html`, `state-*.html`):
 * тот же дрейф, но пятен три, без неподвижного ядра, мельче и резче — размытие 10–14 вместо
 * 38–48. Утверждён именно этот вид (Руслан, 24-09-2026); комментарий в макетах «из эталона
 * без правок» неверен. Высоту — 470 в макетах — задаёт контейнер.
 */
type BackdropVariant = 'home' | 'promo' | 'registration';

defineProps<{ variant: BackdropVariant }>();
</script>

<template>
  <div v-if="variant === 'registration'" class="pointer-events-none absolute inset-0 live-registration" aria-hidden="true">
    <div class="live-blob live-wine" />
    <div class="live-blob live-core" />
    <div class="live-blob live-amber" />
    <div class="live-fade" />
  </div>
  <div v-else class="pointer-events-none absolute inset-0" :class="variant === 'promo' ? 'live-promo' : ''" aria-hidden="true">
    <div class="live-blob live-base" />
    <div class="live-blob live-core" />
    <div class="live-blob live-wine" />
    <div class="live-blob live-amber" />
    <div class="live-fade" />
  </div>
</template>

<style scoped>
.live-blob {
  position: absolute;
  left: 0;
  border-radius: 50%;
  will-change: transform, opacity;
}

.live-base {
  top: -110px;
  left: 50%;
  width: 420px;
  height: 340px;
  margin-left: -210px;
  filter: blur(52px);
  background: radial-gradient(circle, rgba(150, 26, 58, 0.45) 0%, rgba(110, 20, 48, 0.22) 52%, rgba(90, 16, 40, 0) 76%);
}

.live-core {
  top: -140px;
  width: 380px;
  height: 360px;
  filter: blur(38px);
  background: radial-gradient(circle, rgba(214, 38, 78, 0.92) 0%, rgba(158, 24, 60, 0.5) 46%, rgba(120, 20, 48, 0) 72%);
  animation: live-drift-core 13s ease-in-out infinite;
}

.live-wine {
  top: -70px;
  width: 320px;
  height: 320px;
  filter: blur(44px);
  background: radial-gradient(circle, rgba(122, 26, 92, 0.86) 0%, rgba(80, 20, 64, 0.42) 48%, rgba(60, 16, 48, 0) 74%);
  animation: live-drift-wine 17s ease-in-out infinite;
}

.live-amber {
  top: 0;
  width: 300px;
  height: 280px;
  filter: blur(48px);
  background: radial-gradient(circle, rgba(206, 112, 30, 0.7) 0%, rgba(150, 80, 26, 0.32) 48%, rgba(120, 64, 20, 0) 74%);
  animation: live-drift-amber 23s ease-in-out infinite;
}

/* Затемнение книзу: следующий блок не начинается посреди зарева. */
.live-fade {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(11, 13, 17, 0) 52%, rgba(11, 13, 17, 0.86) 86%, #0b0d11 100%);
}

/* Экран приглашения: те же пятна и дрейф, другие высоты и затемнение. */
.live-promo .live-base {
  top: -120px;
  height: 330px;
}

.live-promo .live-core {
  top: -150px;
  height: 340px;
}

.live-promo .live-wine {
  top: -80px;
  height: 300px;
}

.live-promo .live-amber {
  top: -20px;
  height: 260px;
}

.live-promo .live-fade {
  background: linear-gradient(180deg, rgba(11, 13, 17, 0) 44%, rgba(11, 13, 17, 0.8) 78%, #0b0d11 100%);
}

/* Регистрация: пятна от середины, в порядке вино → гранат → янтарь, фон и затемнение те же. */
.live-registration .live-core {
  top: 20px;
  left: 50%;
  width: 300px;
  height: 300px;
  filter: blur(10px);
  background: radial-gradient(circle, rgba(232, 54, 93, 0.55) 0%, rgba(232, 54, 93, 0) 68%);
}

.live-registration .live-wine {
  top: 40px;
  left: 50%;
  width: 360px;
  height: 360px;
  filter: blur(14px);
  background: radial-gradient(circle, rgba(120, 24, 60, 0.6) 0%, rgba(120, 24, 60, 0) 70%);
}

.live-registration .live-amber {
  top: 60px;
  left: 50%;
  width: 260px;
  height: 260px;
  filter: blur(12px);
  background: radial-gradient(circle, rgba(247, 160, 60, 0.32) 0%, rgba(247, 160, 60, 0) 70%);
}

@keyframes live-drift-core {
  0% { transform: translate(-150px, -10px) scale(1); opacity: 0.92; }
  25% { transform: translate(-60px, 60px) scale(1.22); opacity: 1; }
  50% { transform: translate(-170px, 96px) scale(0.9); opacity: 0.8; }
  75% { transform: translate(-260px, 24px) scale(1.12); opacity: 0.95; }
  100% { transform: translate(-150px, -10px) scale(1); opacity: 0.92; }
}

@keyframes live-drift-wine {
  0% { transform: translate(-230px, 40px) scale(1.08); opacity: 0.8; }
  30% { transform: translate(-280px, -30px) scale(0.88); opacity: 1; }
  60% { transform: translate(-90px, 104px) scale(1.26); opacity: 0.7; }
  100% { transform: translate(-230px, 40px) scale(1.08); opacity: 0.8; }
}

@keyframes live-drift-amber {
  0% { transform: translate(-90px, 86px) scale(0.96); opacity: 0.7; }
  35% { transform: translate(-250px, 20px) scale(1.22); opacity: 1; }
  70% { transform: translate(-40px, 116px) scale(1.06); opacity: 0.62; }
  100% { transform: translate(-90px, 86px) scale(0.96); opacity: 0.7; }
}

@media (prefers-reduced-motion: reduce) {
  .live-core,
  .live-wine,
  .live-amber {
    animation: none;
  }
}
</style>
