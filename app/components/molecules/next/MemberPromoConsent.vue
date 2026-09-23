<script setup lang="ts">
/**
 * Под «Участвовать» на экране приглашения: согласие мелким и тихий отказ.
 *
 * Отказ — подчёркнутой строкой: путь есть, но с решением не спорит. Это кнопка, а не ссылка:
 * никуда не ведёт, а меняет состояние экрана.
 *
 * Свечение кнопки над ними накрывает всё, что идёт следом по потоку, поэтому согласию
 * и отказу поднят `z-index`.
 */
defineProps<{
  consent: string;
  decline: string;
}>();

defineEmits<{ decline: [] }>();
</script>

<template>
  <div class="flex flex-col gap-[18px] text-center">
    <p class="promo-consent">{{ consent }}</p>
    <button type="button" class="promo-decline" @click="$emit('decline')">{{ decline }}</button>
  </div>
</template>

<style scoped>
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
</style>
