<script setup lang="ts">
/**
 * Плашка приглашения в акцию под балансом главной — вариант C из
 * `product/design/artboard/promo-invite-banner.html`: баннер без кнопки, нажимается целиком.
 *
 * Видит её тот, кто попал в снимок акции и не вступил. Нажатие открывает экран приглашения.
 * Масса и золото, сундук — тот же вырез, что на обложке рассылки; по карточке пробегает блик.
 *
 * Размеры сундука живут переменными, а поле текста считается из них: меняешь сундук —
 * текст отодвигается сам. База посчитана на 320 px, от 361 всё крупнее.
 */
defineProps<{
  kicker: string;
  /** Заголовок. Перенос строки — `\n`: «Ваши сундуки\nуже ждут». */
  title: string;
  when: string;
}>();

defineEmits<{ open: [] }>();

// Адрес — строкой из скрипта, а не литералом в шаблоне: литерал сборщик превращает в импорт
// модуля, а картинка лежит в `public/` и отдаётся как есть.
const CHEST_IMAGE = '/design/chest-week-ajar.png';
</script>

<template>
  <button type="button" class="invite-banner font-manrope text-left text-xb-text" @click="$emit('open')">
    <span class="invite-glow" aria-hidden="true" />
    <img class="invite-chest" :src="CHEST_IMAGE" alt="">
    <span class="invite-body">
      <span class="invite-kicker">{{ kicker }}</span>
      <span class="invite-title">{{ title }}</span>
      <span class="text-[13px] font-light text-xb-secondary">{{ when }}</span>
    </span>
  </button>
</template>

<style scoped>
.invite-banner {
  --chest-w: 104px;
  --chest-right: 6px;

  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  width: 100%;
  min-height: 128px;
  padding: 18px;
  overflow: hidden;
  cursor: pointer;
  border-radius: 24px;
  border: 1px solid rgba(255, 220, 140, 0.3);
  background:
    radial-gradient(120% 130% at 88% 50%, rgba(255, 190, 90, 0.26) 0%, rgba(150, 90, 20, 0.1) 38%, rgba(20, 23, 29, 0) 68%),
    #14171d;
}

/* Бегущий блик по карточке — тот же приём, что у кнопки на экране приглашения. */
.invite-banner::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 42%;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(100deg, rgba(255, 255, 255, 0) 0%, rgba(255, 236, 190, 0.13) 50%, rgba(255, 255, 255, 0) 100%);
  animation: invite-sheen 5.5s ease-in-out infinite;
}

.invite-glow {
  position: absolute;
  right: -40px;
  top: 50%;
  width: 260px;
  height: 260px;
  transform: translateY(-50%);
  border-radius: 50%;
  filter: blur(42px);
  background: radial-gradient(circle, rgba(255, 196, 96, 0.55) 0%, rgba(190, 120, 30, 0.22) 46%, rgba(120, 70, 16, 0) 74%);
}

.invite-chest {
  position: absolute;
  right: var(--chest-right);
  bottom: 12px;
  width: var(--chest-w);
  height: auto;
  pointer-events: none;
  filter: drop-shadow(0 14px 26px rgba(0, 0, 0, 0.55));
}

.invite-body {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
}

.invite-kicker {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.1px;
  text-transform: uppercase;
  color: #ffd98a;
}

.invite-title {
  font-family: var(--font-unbounded);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.4px;
  white-space: pre-line;
}

@keyframes invite-sheen {
  0% { left: -50%; }
  55%,
  100% { left: 115%; }
}

@media (min-width: 361px) {
  .invite-banner {
    --chest-w: 148px;
    --chest-right: 23px;

    min-height: 150px;
    padding: 25px;
  }

  .invite-kicker {
    font-size: 11px;
    letter-spacing: 1.6px;
  }

  .invite-title {
    font-size: 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .invite-banner::after {
    animation: none;
  }
}
</style>
