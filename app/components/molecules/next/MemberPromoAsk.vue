<script setup lang="ts">
/**
 * Вопрос перед «Участвовать» на экране приглашения и золотая черта над ним.
 *
 * Сверху воздуха много, снизу мало — так вопрос читается как подпись к решению, а не как
 * хвост последнего правила. Кнопка идёт следом, но не здесь: она липнет к низу всего
 * экрана, и её ставит экран.
 */
defineProps<{ ask: string }>();
</script>

<template>
  <div class="flex flex-col gap-[18px] text-center">
    <div class="promo-divider" aria-hidden="true" />
    <div class="promo-ask">{{ ask }}</div>
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
</style>
