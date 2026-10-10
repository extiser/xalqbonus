<script setup lang="ts">
import { formatNumber } from '~/utils/format';

/**
 * Номер строки в таблице веба: сколько строк в таблице, видно без счёта. Цвет `grey` —
 * как у второстепенных чисел таблицы, с данными строки номер не спорит.
 *
 * Ширину колонки и выравнивание вправо задаёт таблица.
 */
defineProps<{
  /** Номер по порядку на экране, с 1 и сплошной через группы. */
  value: number;
}>();
</script>

<template>
  <span class="font-manrope text-[14px] text-web-grey tabular-nums">{{ formatNumber(value) }}</span>
</template>
