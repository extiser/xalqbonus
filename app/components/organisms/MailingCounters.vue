<script setup lang="ts">
import type { MailingCounters } from '#shared/types/mailing';

/**
 * Счётчики исходов рассылки. Считаются сервером по снимку адресатов одним запросом, поэтому
 * сумма плиток под «адресатов» всегда равна ему — если нет, врёт не экран, а база.
 */
defineProps<{
  counters: MailingCounters;
}>();
</script>

<template>
  <dl class="grid grid-cols-2 gap-3 sm:grid-cols-3">
    <MoleculesCounterTile label="Адресатов" :value="counters.total" hint="снимок на момент запуска" />
    <MoleculesCounterTile label="Отправлено" :value="counters.sent" />
    <MoleculesCounterTile label="Ждут отправки" :value="counters.pending" />
    <MoleculesCounterTile
      label="Канал умер"
      :value="counters.invalidChat"
      hint="заблокировали бота или отвязались"
    />
    <MoleculesCounterTile label="Отключили уведомления" :value="counters.skippedDisabled" />
    <MoleculesCounterTile label="Не ушло" :value="counters.failed" hint="Telegram отказал" />
  </dl>
</template>
