<script setup lang="ts">
/**
 * Подпись группы капсом: «Ждут выдачи · 1», «История заказов», «Сегодня», «Настройки».
 *
 * Одна на все разделы водителя — дни в истории, группы в заказах и наградах, подписи блоков
 * на экране заказа, — чтобы разделы выглядели одним приложением. Отступы вокруг ставит
 * контейнер: над днём в истории их меньше, чем над группой в списке карточек.
 */
defineProps<{
  label: string;
  /** Сколько в группе. Нет — подпись без счётчика. */
  count?: number;
}>();
</script>

<template>
  <span class="text-[12px] font-semibold uppercase tracking-[1.2px] text-xb-grey">
    {{ label }}<template v-if="count !== undefined"> · {{ count }}</template>
  </span>
</template>
